import { createHmac, timingSafeEqual } from "node:crypto";

import { readEnvString } from "@/lib/supabase/runtime-env";

export type CorvVirtualAccount = {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string | null;
  reference: string | null;
};

export type CorvTransferResult = {
  reference: string | null;
  error: string | null;
};

type Json = Record<string, unknown>;

export function corvSecret(): string | undefined {
  return readEnvString("CORV_SECRET_KEY") || readEnvString("CORV_API_KEY");
}

export function corvWebhookSecret(): string | undefined {
  return readEnvString("CORV_WEBHOOK_SECRET") || corvSecret();
}

export function corvConfigured(): boolean {
  return Boolean(corvSecret());
}

function corvHosts(): string[] {
  const custom = readEnvString("CORV_API_BASE_URL")?.replace(/\/$/, "");
  if (custom) return [custom];
  return ["https://api.corvpay.com", "https://api.corv.ng"];
}

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function pickString(source: Json | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function nested(source: Json | null, keys: string[]): Json | null {
  if (!source) return null;
  for (const key of keys) {
    const inner = asRecord(source[key]);
    if (inner) return inner;
  }
  return null;
}

function parseVirtualAccount(json: unknown): CorvVirtualAccount | null {
  const root = asRecord(json);
  const data = nested(root, ["data", "account", "result", "virtual_account"]) ?? root;
  const accountNumber = pickString(data, [
    "account_number",
    "accountNumber",
    "nuban",
    "number",
  ]);
  if (!accountNumber) return null;
  return {
    accountNumber,
    accountName: pickString(data, ["account_name", "accountName", "name"]) ?? "TIJAR",
    bankName: pickString(data, ["bank_name", "bankName", "bank"]) ?? "Bank",
    bankCode: pickString(data, ["bank_code", "bankCode"]),
    reference: pickString(data, ["reference", "id", "account_reference", "accountReference"]),
  };
}

function messageFrom(json: unknown, fallback: string): string {
  const root = asRecord(json);
  return (
    pickString(root, ["message", "error", "detail"]) ||
    pickString(nested(root, ["error", "data"]), ["message", "error"]) ||
    fallback
  );
}

function needsIdentity(message: string): boolean {
  return /bvn|nin|kyc|identity/i.test(message);
}

async function corvFetch(
  path: string,
  init: RequestInit,
): Promise<{ res: Response; json: unknown; host: string } | { error: string }> {
  const secret = corvSecret();
  if (!secret) return { error: "Corv is not connected yet." };
  const headers = {
    Authorization: `Bearer ${secret}`,
    "api-key": secret,
    "x-api-key": secret,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  let lastError = "Could not reach Corv.";
  for (const host of corvHosts()) {
    try {
      const res = await fetch(`${host}${path}`, { ...init, headers });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { message: text.slice(0, 300) };
      }
      if (res.status === 404 || res.status === 405) {
        lastError = messageFrom(json, `Corv ${path} was not found.`);
        continue;
      }
      return { res, json, host };
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  return { error: lastError };
}

const CREATE_PATHS = [
  "/v1/virtual-accounts",
  "/v1/virtual-account",
  "/api/v1/virtual-accounts",
  "/api/v1/virtual-account",
  "/v1/collections/virtual-account",
  "/v1/collections/virtual-accounts",
  "/v1/accounts/virtual",
  "/v1/dedicated-accounts",
  "/v1/nuban",
  "/virtual-accounts",
];

export async function corvCreateVirtualAccount(input: {
  reference: string;
  accountName: string;
  email: string;
  phone?: string;
  bvn?: string;
}): Promise<{ account: CorvVirtualAccount | null; error: string | null; needsBvn?: boolean }> {
  const body = {
    account_name: input.accountName,
    accountName: input.accountName,
    name: input.accountName,
    email: input.email,
    phone: input.phone,
    phonenumber: input.phone,
    reference: input.reference,
    account_reference: input.reference,
    permanent: true,
    is_permanent: true,
    currency: "NGN",
    customer: {
      name: input.accountName,
      email: input.email,
      phone: input.phone,
    },
    kyc: input.bvn ? { bvn: input.bvn } : undefined,
    bvn: input.bvn,
  };

  let lastError = "Could not create a virtual account.";
  for (const path of CREATE_PATHS) {
    const result = await corvFetch(path, { method: "POST", body: JSON.stringify(body) });
    if ("error" in result) {
      lastError = result.error;
      continue;
    }
    if (!result.res.ok) {
      lastError = messageFrom(result.json, lastError);
      if (result.res.status === 401 || result.res.status === 403) {
        return { account: null, error: lastError };
      }
      continue;
    }
    const account = parseVirtualAccount(result.json);
    if (account) return { account, error: null };
    lastError = messageFrom(result.json, "Corv did not return an account number.");
  }
  return { account: null, error: lastError, needsBvn: needsIdentity(lastError) };
}

const TRANSFER_PATHS = [
  "/v1/transfers",
  "/api/v1/transfers",
  "/v1/payouts",
  "/transfers",
];

export async function corvTransfer(input: {
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  amount: number;
  reference: string;
  narration: string;
}): Promise<CorvTransferResult> {
  const body = {
    account_bank: input.bankCode,
    bank_code: input.bankCode,
    bankCode: input.bankCode,
    account_number: input.accountNumber,
    accountNumber: input.accountNumber,
    account_name: input.accountName,
    amount: input.amount,
    currency: "NGN",
    reference: input.reference,
    narration: input.narration,
    reason: input.narration,
  };
  let lastError = "Could not send payout.";
  for (const path of TRANSFER_PATHS) {
    const result = await corvFetch(path, { method: "POST", body: JSON.stringify(body) });
    if ("error" in result) {
      lastError = result.error;
      continue;
    }
    if (!result.res.ok) {
      lastError = messageFrom(result.json, lastError);
      if (result.res.status === 401 || result.res.status === 403) {
        return { reference: null, error: lastError };
      }
      continue;
    }
    const root = asRecord(result.json);
    const data = nested(root, ["data", "result"]) ?? root;
    const reference =
      pickString(data, ["reference", "id", "transfer_code", "session_id"]) ?? input.reference;
    return { reference, error: null };
  }
  return { reference: null, error: lastError };
}

export function corvWebhookOk(request: Request, raw: string): boolean {
  const expected = corvWebhookSecret();
  if (!expected) return false;
  const header =
    request.headers.get("x-corv-signature") ||
    request.headers.get("x-webhook-signature") ||
    request.headers.get("x-signature") ||
    request.headers.get("corv-signature");
  if (!header) return false;
  const digest = createHmac("sha256", expected).update(raw).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(header.replace(/^sha256=/i, ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseCorvCredit(payload: unknown): {
  amount: number;
  accountNumber: string | null;
  reference: string | null;
  businessReference: string | null;
} | null {
  const root = asRecord(payload);
  if (!root) return null;
  const event = pickString(root, ["event", "type", "event_type"]) ?? "";
  if (event && /payout|transfer\.(success|completed)|withdrawal/i.test(event) && !/credit|collection|virtual/i.test(event)) {
    return null;
  }
  const data = nested(root, ["data", "payload", "result"]) ?? root;
  const amountRaw =
    pickString(data, ["amount", "amount_ngn", "settled_amount", "originatoramount"]) ??
    pickString(nested(data, ["transaction", "charge"]), ["amount"]);
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const status = pickString(data, ["status"]) ?? "success";
  if (status && /fail|reject|cancel/i.test(status)) return null;
  const kobo = Number(pickString(data, ["amount_kobo", "amountKobo"]) ?? "");
  return {
    amount: Number.isFinite(kobo) && kobo > 0 ? kobo / 100 : amount,
    accountNumber: pickString(data, [
      "account_number",
      "accountNumber",
      "virtual_account_number",
      "destination_account_number",
      "nuban",
    ]),
    reference: pickString(data, ["reference", "id", "session_id", "sessionId", "flw_ref", "tx_ref"]),
    businessReference: pickString(data, [
      "account_reference",
      "accountReference",
      "customer_reference",
      "metadata.business_id",
    ]),
  };
}
