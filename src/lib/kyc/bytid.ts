import { readEnvString } from "@/lib/supabase/runtime-env";
import { sanitizeSecret } from "@/lib/secrets";

const BYTID_BASE = "https://api.bytid.com/v1";

export type BytidIdKind = "bvn" | "nin";

export type BytidLookupResult = {
  ok: boolean;
  status: string;
  error?: string;
  httpStatus?: number;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fieldMatches?: { first_name?: boolean; last_name?: boolean; date_of_birth?: boolean } | null;
  reference?: string | null;
  maskedId?: string | null;
  message?: string | null;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function bytidIdentityLookup(input: {
  kind: BytidIdKind;
  idNumber: string;
  firstName: string;
  lastName: string;
  dob?: string;
  reference: string;
}): Promise<BytidLookupResult> {
  const key = bytidKey();
  if (!key) {
    return {
      ok: false,
      status: "unconfigured",
      httpStatus: 503,
      error: "Add BYTID_KEY in Vercel Environment Variables for Production, then redeploy.",
    };
  }

  const idNumber = digitsId(input.idNumber);
  if (idNumber.length !== 11) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter an 11-digit BVN or NIN." };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (firstName.length < 2 || lastName.length < 2) {
    return { ok: false, status: "invalid", httpStatus: 400, error: "Enter the first and last name on the ID." };
  }

  const body: Record<string, unknown> = {
    id_number: idNumber,
    first_name: firstName,
    last_name: lastName,
    reference: input.reference.slice(0, 100),
  };
  if (input.dob && /^\d{4}-\d{2}-\d{2}$/.test(input.dob)) body.dob = input.dob;

  let res: Response;
  try {
    res = await fetch(`${BYTID_BASE}/identity/${input.kind}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: "failed", httpStatus: 502, error: "Could not reach Bytid. Try again." };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const root = asRecord(json);
  const data = asRecord(root?.data) ?? root;
  const person = asRecord(data?.data);
  const status = String(data?.status ?? root?.status ?? (res.ok ? "verified" : "failed"));
  const message = String(data?.message ?? root?.message ?? root?.error ?? "").trim() || null;
  const fieldMatches = asRecord(data?.field_matches) as BytidLookupResult["fieldMatches"];

  if (res.status === 409) {
    return {
      ok: false,
      status: "duplicate",
      httpStatus: 409,
      error: "This check was already billed. Refresh the shop page, or try again in a minute.",
      reference: typeof data?.reference === "string" ? data.reference : input.reference,
    };
  }

  if (!res.ok) {
    const err =
      status === "not_found"
        ? `This ${input.kind.toUpperCase()} was not found.`
        : message || `Bytid could not verify this ${input.kind.toUpperCase()}.`;
    return {
      ok: false,
      status: status || "failed",
      httpStatus: res.status >= 400 ? res.status : 502,
      error: err,
      message,
    };
  }

  return {
    ok: status === "verified",
    status,
    fullName: typeof person?.full_name === "string" ? person.full_name : null,
    firstName: typeof person?.first_name === "string" ? person.first_name : null,
    lastName: typeof person?.last_name === "string" ? person.last_name : null,
    fieldMatches,
    reference: typeof data?.reference === "string" ? data.reference : input.reference,
    maskedId: typeof data?.id_number === "string" ? data.id_number : null,
    message,
  };
}

export function namesMatchRecord(result: BytidLookupResult): boolean {
  if (result.status !== "verified") return false;
  const matches = result.fieldMatches;
  if (!matches) return true;
  if (matches.first_name === false || matches.last_name === false) return false;
  return true;
}
