import { readEnvString } from "@/lib/supabase/runtime-env";
import { sanitizeSecret } from "@/lib/secrets";

const BYTID_BASE = "https://api.bytid.com/v1";

export type BytidLookupResult = {
  ok: boolean;
  status: string;
  error?: string;
  httpStatus?: number;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  stateOfOrigin?: string | null;
  nationality?: string | null;
  fieldMatches?: { first_name?: boolean; last_name?: boolean; date_of_birth?: boolean } | null;
  face?: { status?: string; score?: number; liveness?: string } | null;
  reference?: string | null;
  maskedId?: string | null;
  message?: string | null;
  person?: Record<string, unknown> | null;
};

export type BytidCacResult = {
  ok: boolean;
  status: string;
  error?: string;
  httpStatus?: number;
  legalName?: string | null;
  registrationNumber?: string | null;
  companyStatus?: string | null;
  address?: string | null;
  companyType?: string | null;
  directors?: string[];
  details?: Record<string, unknown> | null;
};

export type BytidLivenessSession = {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  id?: string;
  url?: string | null;
  status?: string;
  live?: boolean;
  usableForFaceMatch?: boolean;
  score?: number | null;
};

export function bytidKey(): string | null {
  return sanitizeSecret(readEnvString("BYTID_KEY") || readEnvString("BYTID_API_KEY") || readEnvString("BYTEID_API_KEY"));
}

export function bytidConfigured(): boolean {
  return Boolean(bytidKey());
}

export function digitsId(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 11);
}

export function normalizeCacNumber(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 20);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function errorFromEnvelope(root: Record<string, unknown> | null, fallback: string): string {
  const err = asRecord(root?.error);
  if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
  const details = err?.details;
  if (Array.isArray(details) && typeof details[0] === "string") return details[0];
  return fallback;
}

async function bytidRequest(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ res: Response; root: Record<string, unknown> | null; data: Record<string, unknown> | null }> {
  const key = bytidKey();
  if (!key) throw new Error("BYTID_UNCONFIGURED");
  const res = await fetch(`${BYTID_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const root = asRecord(json);
  const data = asRecord(root?.data) ?? root;
  return { res, root, data };
}

function unconfigured(): BytidLookupResult {
  return {
    ok: false,
    status: "unconfigured",
    httpStatus: 503,
    error: "Add BYTID_KEY in Vercel Environment Variables for Production, then redeploy.",
  };
}

function flattenCheckPerson(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  const nested = asRecord(data.data);
  const rest = { ...data };
  delete rest.data;
  delete rest.face_match;
  delete rest.field_matches;
  return { ...rest, ...(nested ?? {}) };
}

function personFromCheck(data: Record<string, unknown> | null, root: Record<string, unknown> | null, fallbackRef: string): BytidLookupResult {
  const person = flattenCheckPerson(data);
  const face = asRecord(data?.face_match);
  const status = String(data?.status ?? "failed");
  return {
    ok: status === "verified",
    status,
    fullName: typeof person?.full_name === "string" ? person.full_name : null,
    firstName: typeof person?.first_name === "string" ? person.first_name : null,
    lastName: typeof person?.last_name === "string" ? person.last_name : null,
    middleName: typeof person?.middle_name === "string" ? person.middle_name : null,
    dateOfBirth: typeof person?.date_of_birth === "string" ? person.date_of_birth : null,
    gender: typeof person?.gender === "string" ? person.gender : null,
    phone: typeof person?.phone_number === "string" ? person.phone_number : null,
    stateOfOrigin: typeof person?.state_of_origin === "string" ? person.state_of_origin : null,
    nationality: typeof person?.nationality === "string" ? person.nationality : null,
    fieldMatches: asRecord(data?.field_matches) as BytidLookupResult["fieldMatches"],
    face: face
      ? {
          status: typeof face.status === "string" ? face.status : undefined,
          score: typeof face.score === "number" ? face.score : undefined,
          liveness: typeof face.liveness === "string" ? face.liveness : undefined,
        }
      : null,
    reference: typeof data?.reference === "string" ? data.reference : fallbackRef,
    maskedId: typeof data?.id_number === "string" ? data.id_number : null,
    message: typeof data?.message === "string" ? data.message : null,
    person,
  };
}

function checkFailed(
  res: Response,
  root: Record<string, unknown> | null,
  data: Record<string, unknown> | null,
  fallback: string,
): BytidLookupResult | null {
  if (res.status === 409) {
    return {
      ok: false,
      status: "duplicate",
      httpStatus: 409,
      error: "This check was already billed. Try again in a minute.",
      reference: typeof data?.reference === "string" ? data.reference : null,
    };
  }
  if (root?.success === false || (res.status >= 400 && res.status !== 200)) {
    const code = String(asRecord(root?.error)?.code ?? "");
    return {
      ok: false,
      status: code || "failed",
      httpStatus: res.status,
      error: errorFromEnvelope(root, fallback),
    };
  }
  const status = String(data?.status ?? "");
  if (status === "not_found") {
    return { ok: false, status: "not_found", httpStatus: 200, error: "This NIN was not found." };
  }
  if (status === "failed") {
    return { ok: false, status: "failed", httpStatus: 200, error: "The ID registry was busy. Try again." };
  }
  return null;
}

export async function bytidNinLookup(input: { idNumber: string; reference: string }): Promise<BytidLookupResult> {
  if (!bytidKey()) return unconfigured();
  const idNumber = digitsId(input.idNumber);
  if (idNumber.length !== 11) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter an 11-digit NIN." };
  }
  try {
    const { res, root, data } = await bytidRequest("POST", "/identity/nin", {
      id_number: idNumber,
      reference: input.reference.slice(0, 100),
    });
    const failed = checkFailed(res, root, data, "Bytid could not look up this NIN.");
    if (failed) return failed;
    return personFromCheck(data, root, input.reference);
  } catch (error) {
    if (error instanceof Error && error.message === "BYTID_UNCONFIGURED") return unconfigured();
    return { ok: false, status: "failed", httpStatus: 502, error: "Could not reach Bytid. Try again." };
  }
}

export async function bytidCreateLiveness(input: {
  reference: string;
  redirectUrl: string;
}): Promise<BytidLivenessSession> {
  if (!bytidKey()) return { ok: false, httpStatus: 503, error: unconfigured().error };
  try {
    const { res, root, data } = await bytidRequest("POST", "/liveness/sessions", {
      reference: input.reference.slice(0, 100),
      redirect_url: input.redirectUrl,
    });
    if (root?.success === false || res.status >= 400) {
      return { ok: false, httpStatus: res.status, error: errorFromEnvelope(root, "Could not start live face check.") };
    }
    return {
      ok: true,
      id: typeof data?.id === "string" ? data.id : undefined,
      url: typeof data?.url === "string" ? data.url : null,
      status: typeof data?.status === "string" ? data.status : "pending",
    };
  } catch {
    return { ok: false, httpStatus: 502, error: "Could not start live face check." };
  }
}

export async function bytidGetLiveness(sessionId: string): Promise<BytidLivenessSession> {
  if (!bytidKey()) return { ok: false, httpStatus: 503, error: unconfigured().error };
  try {
    const { res, root, data } = await bytidRequest("GET", `/liveness/sessions/${encodeURIComponent(sessionId)}`);
    if (root?.success === false || res.status >= 400) {
      return { ok: false, httpStatus: res.status, error: errorFromEnvelope(root, "Could not read the live face session.") };
    }
    return {
      ok: true,
      id: typeof data?.id === "string" ? data.id : sessionId,
      status: typeof data?.status === "string" ? data.status : undefined,
      live: Boolean(data?.live),
      usableForFaceMatch: Boolean(data?.usable_for_face_match),
      score: typeof data?.score === "number" ? data.score : null,
    };
  } catch {
    return { ok: false, httpStatus: 502, error: "Could not read the live face session." };
  }
}

export async function bytidNinLiveFaceMatch(input: {
  idNumber: string;
  firstName?: string;
  lastName?: string;
  livenessSessionId: string;
  reference: string;
}): Promise<BytidLookupResult> {
  if (!bytidKey()) return unconfigured();
  const idNumber = digitsId(input.idNumber);
  if (idNumber.length !== 11) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter an 11-digit NIN." };
  }
  if (!input.livenessSessionId.trim()) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Finish the live face check first." };
  }
  const body: Record<string, unknown> = {
    id_number: idNumber,
    liveness_session_id: input.livenessSessionId.trim(),
    reference: input.reference.slice(0, 100),
  };
  if (input.firstName?.trim()) body.first_name = input.firstName.trim();
  if (input.lastName?.trim()) body.last_name = input.lastName.trim();
  try {
    const { res, root, data } = await bytidRequest("POST", "/identity/nin/face-match", body);
    const failed = checkFailed(res, root, data, "Bytid could not match this live face to the NIN.");
    if (failed) return failed;
    return personFromCheck(data, root, input.reference);
  } catch (error) {
    if (error instanceof Error && error.message === "BYTID_UNCONFIGURED") return unconfigured();
    return { ok: false, status: "failed", httpStatus: 502, error: "Could not reach Bytid. Try again." };
  }
}

export async function bytidCacLookup(input: { cacNumber: string; reference: string }): Promise<BytidCacResult> {
  if (!bytidKey()) {
    return { ok: false, status: "unconfigured", httpStatus: 503, error: unconfigured().error };
  }
  const idNumber = normalizeCacNumber(input.cacNumber);
  if (idNumber.length < 5) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter a CAC number such as RC123456 or BN123456." };
  }
  try {
    const { res, root, data } = await bytidRequest("POST", "/business/cac", {
      id_number: idNumber,
      reference: input.reference.slice(0, 100),
    });
    if (root?.success === false || (res.status >= 400 && res.status !== 200)) {
      return {
        ok: false,
        status: String(asRecord(root?.error)?.code ?? "failed"),
        httpStatus: res.status,
        error: errorFromEnvelope(root, "Bytid could not verify this CAC."),
      };
    }
    const company = asRecord(data?.data);
    const status = String(data?.status ?? "failed");
    if (status !== "verified") {
      return {
        ok: false,
        status,
        httpStatus: 200,
        error: status === "not_found" ? "This CAC number was not found." : "CAC lookup did not verify.",
      };
    }
    const directors = Array.isArray(company?.directors)
      ? company.directors.map((row) => (asRecord(row)?.name as string | undefined) ?? "").filter(Boolean)
      : [];
    return {
      ok: true,
      status,
      legalName: typeof company?.legal_name === "string" ? company.legal_name : null,
      registrationNumber: typeof company?.registration_number === "string" ? company.registration_number : idNumber,
      companyStatus: typeof company?.status === "string" ? company.status : null,
      address: typeof company?.address === "string" ? company.address : null,
      companyType: typeof company?.company_type === "string" ? company.company_type : null,
      directors,
      details: company,
    };
  } catch {
    return { ok: false, status: "failed", httpStatus: 502, error: "Could not reach Bytid. Try again." };
  }
}

export function faceMatched(result: BytidLookupResult): boolean {
  return result.face?.status === "matched";
}

export type NinRecord = {
  id_number: string;
  id_type: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  state_of_residence: string | null;
  state_of_origin: string | null;
  nationality: string | null;
  full_name: string | null;
};

function pickString(person: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = person[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function formatAddress(person: Record<string, unknown>): string | null {
  const nested = asRecord(person.address) ?? asRecord(person.residential_address);
  if (nested) {
    const joined = ["house_number", "street", "address_line", "city", "town", "lga", "state", "state_of_residence"]
      .map((key) => (typeof nested[key] === "string" ? nested[key].trim() : ""))
      .filter(Boolean)
      .join(", ");
    if (joined) return joined;
  }
  return pickString(person, ["address", "residential_address", "residence_address", "house_address"]);
}

export function extractNinRecord(person: Record<string, unknown> | null | undefined, typedNin: string): NinRecord {
  const p = person ?? {};
  const first = pickString(p, ["first_name"]);
  const middle = pickString(p, ["middle_name"]);
  const last = pickString(p, ["last_name"]);
  const full =
    pickString(p, ["full_name"]) ||
    [first, middle, last].filter(Boolean).join(" ") ||
    null;
  const id = digitsId(typedNin);
  return {
    id_number: id.length === 11 ? id : pickString(p, ["id_number"]) ?? "",
    id_type: "NIN",
    first_name: first,
    middle_name: middle,
    last_name: last,
    date_of_birth: pickString(p, ["date_of_birth", "dob"]),
    gender: pickString(p, ["gender"]),
    phone: pickString(p, ["phone_number", "phone", "mobile"]),
    address: formatAddress(p),
    state_of_residence: pickString(p, ["state_of_residence", "residence_state", "state"]),
    state_of_origin: pickString(p, ["state_of_origin"]),
    nationality: pickString(p, ["nationality"]),
    full_name: full,
  };
}

export function ninDetailsForStorage(record: NinRecord, step: string): Record<string, unknown> {
  const last4 = digitsId(record.id_number).slice(-4);
  return {
    id_type: "NIN",
    id_number: maskNin(record.id_number),
    last4,
    first_name: record.first_name,
    middle_name: record.middle_name,
    last_name: record.last_name,
    full_name: record.full_name,
    date_of_birth: record.date_of_birth,
    gender: record.gender,
    phone: record.phone,
    phone_number: record.phone,
    address: record.address,
    state_of_residence: record.state_of_residence,
    state_of_origin: record.state_of_origin,
    nationality: record.nationality,
    step,
  };
}

export function maskNin(idNumber: string): string {
  const digits = digitsId(idNumber);
  if (digits.length !== 11) return "*****";
  return `${digits.slice(0, 3)}*****${digits.slice(-3)}`;
}

export function isShopIdentityVerified(business: {
  verification_status?: string | null;
  kyc_verified_at?: string | null;
  kyc_face_matched?: boolean | null;
  kyc_id_last4?: string | null;
}): boolean {
  // Real NIN/face completion writes kyc_verified_at. Bulk "verified" flags do not.
  return business.verification_status === "verified" && Boolean(business.kyc_verified_at);
}
