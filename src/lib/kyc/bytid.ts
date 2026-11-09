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

async function bytidPost(path: string, body: Record<string, unknown>): Promise<{
  res: Response;
  root: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
}> {
  const key = bytidKey();
  if (!key) {
    throw new Error("BYTID_UNCONFIGURED");
  }
  const res = await fetch(`${BYTID_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
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

export async function bytidNinFaceMatch(input: {
  idNumber: string;
  firstName: string;
  lastName: string;
  dob?: string;
  selfieImage: string;
  reference: string;
}): Promise<BytidLookupResult> {
  if (!bytidKey()) return unconfigured();

  const idNumber = digitsId(input.idNumber);
  if (idNumber.length !== 11) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter an 11-digit NIN." };
  }
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (firstName.length < 2 || lastName.length < 2) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter the first and last name on the NIN." };
  }
  const selfie = input.selfieImage.trim();
  if (selfie.length < 80) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Take a clear selfie of your face." };
  }

  const body: Record<string, unknown> = {
    id_number: idNumber,
    first_name: firstName,
    last_name: lastName,
    selfie_image: selfie,
    reference: input.reference.slice(0, 100),
  };
  if (input.dob && /^\d{4}-\d{2}-\d{2}$/.test(input.dob)) body.dob = input.dob;

  let posted: Awaited<ReturnType<typeof bytidPost>>;
  try {
    posted = await bytidPost("/identity/nin/face-match", body);
  } catch (error) {
    if (error instanceof Error && error.message === "BYTID_UNCONFIGURED") return unconfigured();
    return { ok: false, status: "failed", httpStatus: 502, error: "Could not reach Bytid. Try again." };
  }

  const { res, root, data } = posted;
  const person = asRecord(data?.data);
  const face = asRecord(data?.face_match);
  const status = String(data?.status ?? root?.status ?? (res.ok ? "verified" : "failed"));
  const message = String(data?.message ?? root?.message ?? root?.error ?? "").trim() || null;
  const fieldMatches = asRecord(data?.field_matches) as BytidLookupResult["fieldMatches"];

  if (res.status === 409) {
    return {
      ok: false,
      status: "duplicate",
      httpStatus: 409,
      error: "This check was already billed. Wait a minute, then try again.",
      reference: typeof data?.reference === "string" ? data.reference : input.reference,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: status || "failed",
      httpStatus: res.status >= 400 ? res.status : 502,
      error: status === "not_found" ? "This NIN was not found." : message || "Bytid could not verify this NIN.",
      message,
    };
  }

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
    fieldMatches,
    face: face
      ? {
          status: typeof face.status === "string" ? face.status : undefined,
          score: typeof face.score === "number" ? face.score : undefined,
          liveness: typeof face.liveness === "string" ? face.liveness : undefined,
        }
      : null,
    reference: typeof data?.reference === "string" ? data.reference : input.reference,
    maskedId: typeof data?.id_number === "string" ? data.id_number : null,
    message,
    person,
  };
}

export async function bytidCacLookup(input: { cacNumber: string; reference: string }): Promise<BytidCacResult> {
  if (!bytidKey()) {
    return {
      ok: false,
      status: "unconfigured",
      httpStatus: 503,
      error: "Add BYTID_KEY in Vercel Environment Variables for Production, then redeploy.",
    };
  }
  const idNumber = normalizeCacNumber(input.cacNumber);
  if (idNumber.length < 5) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter a CAC number such as RC123456 or BN123456." };
  }
  let posted: Awaited<ReturnType<typeof bytidPost>>;
  try {
    posted = await bytidPost("/business/cac", { id_number: idNumber, reference: input.reference.slice(0, 100) });
  } catch {
    return { ok: false, status: "failed", httpStatus: 502, error: "Could not reach Bytid. Try again." };
  }
  const { res, root, data } = posted;
  const company = asRecord(data?.data);
  const status = String(data?.status ?? root?.status ?? (res.ok ? "verified" : "failed"));
  const message = String(data?.message ?? root?.message ?? root?.error ?? "").trim();
  if (!res.ok) {
    return {
      ok: false,
      status: status || "failed",
      httpStatus: res.status >= 400 ? res.status : 502,
      error: status === "not_found" ? "This CAC number was not found." : message || "Bytid could not verify this CAC.",
    };
  }
  const directors = Array.isArray(company?.directors)
    ? company.directors
        .map((row) => (asRecord(row)?.name as string | undefined) ?? "")
        .filter(Boolean)
    : [];
  return {
    ok: status === "verified",
    status,
    legalName: typeof company?.legal_name === "string" ? company.legal_name : null,
    registrationNumber: typeof company?.registration_number === "string" ? company.registration_number : idNumber,
    companyStatus: typeof company?.status === "string" ? company.status : null,
    address: typeof company?.address === "string" ? company.address : null,
    companyType: typeof company?.company_type === "string" ? company.company_type : null,
    directors,
    details: company,
  };
}

export function namesMatchRecord(result: BytidLookupResult): boolean {
  if (result.status !== "verified") return false;
  const matches = result.fieldMatches;
  if (!matches) return true;
  if (matches.first_name === false || matches.last_name === false) return false;
  return true;
}

export function faceMatched(result: BytidLookupResult): boolean {
  return result.face?.status === "matched";
}
