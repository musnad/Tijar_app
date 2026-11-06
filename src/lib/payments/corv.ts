import { createHmac, timingSafeEqual } from "node:crypto";

import { readEnvString } from "@/lib/supabase/runtime-env";

export type CorvVirtualAccount = {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string | null;
  reference: string | null;
  bank?: string | null;
  id?: string | null;
};

export type CorvBank = { id: string; name: string };

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

function corvBase(): string {
  return (readEnvString("CORV_API_BASE_URL") || "https://api.corvi.ng/api/v1").replace(/\/$/, "");
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

function nigeriaPhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("234") && digits.length >= 13) return `0${digits.slice(3)}`;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

function parseOneAccount(json: unknown): CorvVirtualAccount | null {
  const root = asRecord(json);
  const data = nested(root, ["data", "account", "result"]) ?? root;
  const accountNumber = pickString(data, ["accountNumber", "account_number", "nuban", "number"]);
  if (!accountNumber) return null;
  return {
    accountNumber,
    accountName: pickString(data, ["accountName", "account_name", "name"]) ?? "TIJAR",
    bankName: pickString(data, ["bankName", "bank_name"]) ?? pickString(data, ["bank"]) ?? "Bank",
    bankCode: pickString(data, ["bankCode", "bank_code", "bank"]),
    reference: pickString(data, ["reference", "id"]),
    bank: pickString(data, ["bank", "provider"]),
    id: pickString(data, ["id"]),
  };
}

function parseAccountList(json: unknown): CorvVirtualAccount[] {
  if (Array.isArray(json)) {
    return json.map(parseOneAccount).filter((row): row is CorvVirtualAccount => Boolean(row));
  }
  const root = asRecord(json);
  const nestedList =
    (root?.data && Array.isArray(root.data) ? root.data : null) ||
    (root?.accounts && Array.isArray(root.accounts) ? root.accounts : null) ||
    (nested(root, ["data"]) && Array.isArray(nested(root, ["data"])?.accounts)
      ? (nested(root, ["data"])!.accounts as unknown[])
      : null);
  if (nestedList) {
    return nestedList.map(parseOneAccount).filter((row): row is CorvVirtualAccount => Boolean(row));
  }
  const one = parseOneAccount(json);
  return one ? [one] : [];
}

function messageFrom(json: unknown, fallback: string): string {
  const root = asRecord(json);
  return (
    pickString(root, ["message", "error", "detail", "responseMessage"]) ||
    pickString(nested(root, ["error", "data"]), ["message", "error"]) ||
    fallback
  );
}

async function corvFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ res: Response; json: unknown } | { error: string }> {
  const secret = corvSecret();
  if (!secret) return { error: "Corv is not connected yet." };
  const url = `${corvBase()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "x-api-key": secret,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { message: text.slice(0, 300) };
    }
    return { res, json };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach Corv." };
  }
}

export async function corvListBanks(): Promise<{ banks: CorvBank[]; error: string | null }> {
  const result = await corvFetch("/virtual-accounts/banks");
  if ("error" in result) return { banks: [], error: result.error };
  if (!result.res.ok) return { banks: [], error: messageFrom(result.json, "Could not load Corv banks.") };
  const rows = Array.isArray(result.json)
    ? result.json
    : Array.isArray(asRecord(result.json)?.data)
      ? (asRecord(result.json)!.data as unknown[])
      : [];
  const banks = rows
    .map((row) => {
      const rec = asRecord(row);
      const id = pickString(rec, ["id", "code", "bank"]);
      const name = pickString(rec, ["name", "bankName", "bank_name"]);
      return id ? { id, name: name ?? id } : null;
    })
    .filter((row): row is CorvBank => Boolean(row));
  return { banks, error: null };
}

export async function corvCreateVirtualAccount(input: {
  accountName: string;
  email: string;
  phone?: string;
  idType: "bvn" | "nin";
  idNumber: string;
}): Promise<{ accounts: CorvVirtualAccount[]; account: CorvVirtualAccount | null; error: string | null; needsBvn?: boolean }> {
  const idNumber = input.idNumber.replace(/\D/g, "");
  if (idNumber.length !== 11) {
    return { accounts: [], account: null, error: "Enter an 11-digit BVN or NIN.", needsBvn: true };
  }

  const banksRes = await corvListBanks();
  const bankIds = banksRes.banks.map((b) => b.id);
  const body = {
    name: input.accountName,
    email: input.email,
    phoneNumber: nigeriaPhone(input.phone),
    idType: input.idType,
    idNumber,
    bank: bankIds.length ? bankIds : "rubies",
  };

  const result = await corvFetch("/virtual-accounts", { method: "POST", body: JSON.stringify(body) });
  if ("error" in result) return { accounts: [], account: null, error: result.error };
  if (!result.res.ok) {
    const error = messageFrom(result.json, "Could not create a virtual account.");
    return {
      accounts: [],
      account: null,
      error,
      needsBvn: /bvn|nin|idNumber|idType|identity/i.test(error),
    };
  }
  const accounts = parseAccountList(result.json);
  if (!accounts.length) {
    return { accounts: [], account: null, error: messageFrom(result.json, "Corv did not return an account number.") };
  }
  return { accounts, account: accounts[0] ?? null, error: null };
}

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
  const paths = ["/transfers", "/payouts", "/virtual-accounts/transfers"];
  let lastError = "Could not send payout.";
  for (const path of paths) {
    const result = await corvFetch(path, { method: "POST", body: JSON.stringify(body) });
    if ("error" in result) {
      lastError = result.error;
      continue;
    }
    if (result.res.status === 404 || result.res.status === 405) continue;
    if (!result.res.ok) {
      lastError = messageFrom(result.json, lastError);
      continue;
    }
    const root = asRecord(result.json);
    const data = nested(root, ["data", "result"]) ?? root;
    return {
      reference: pickString(data, ["reference", "id", "transfer_code", "session_id"]) ?? input.reference,
      error: null,
    };
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
  const data = nested(root, ["data", "payload", "result", "transaction"]) ?? root;
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
      "accountNumber",
      "account_number",
      "virtual_account_number",
      "destination_account_number",
      "nuban",
    ]),
    reference: pickString(data, ["reference", "id", "session_id", "sessionId", "flw_ref", "tx_ref"]),
    businessReference: pickString(data, ["account_reference", "accountReference", "customer_reference"]),
  };
}
