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
  return (
    readEnvString("CORV_SECRET_KEY") ||
    readEnvString("CORV_API_KEY") ||
    readEnvString("CORVI_SECRET_KEY") ||
    readEnvString("CORVI_API_KEY")
  );
}

export function corvWebhookSecret(): string | undefined {
  return readEnvString("CORV_WEBHOOK_SECRET") || corvSecret();
}

export function corvConfigured(): boolean {
  return Boolean(corvSecret());
}

function corvBase(): string {
  const custom = readEnvString("CORV_API_BASE_URL")?.replace(/\/$/, "") ?? "";
  if (custom && /corvi\.ng/i.test(custom)) {
    return /\/api\/v1$/i.test(custom) ? custom : `${custom}/api/v1`;
  }
  return "https://api.corvi.ng/api/v1";
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
  if (!root) return fallback;
  const rawMessage = root.message;
  const fromArray = Array.isArray(rawMessage)
    ? rawMessage.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ")
    : null;
  return (
    fromArray ||
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
  if (banksRes.error && /invalid|expired|unauthorized|api key/i.test(banksRes.error)) {
    return { accounts: [], account: null, error: banksRes.error };
  }
  const bank = banksRes.banks[0]?.id || "rubies";
  const body: Record<string, unknown> = {
    name: input.accountName,
    email: input.email,
    idType: input.idType,
    idNumber,
    bank,
  };
  const phoneNumber = nigeriaPhone(input.phone);
  if (phoneNumber) body.phoneNumber = phoneNumber;

  const result = await corvFetch("/virtual-accounts", { method: "POST", body: JSON.stringify(body) });
  if ("error" in result) return { accounts: [], account: null, error: result.error };
  if (!result.res.ok) {
    const error = messageFrom(result.json, `Could not create a virtual account (${result.res.status}).`);
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
  const bodies = [
    {
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      amount: input.amount,
      narration: input.narration,
      reference: input.reference,
      currency: "NGN",
    },
    {
      destinationBankCode: input.bankCode,
      destinationAccountNumber: input.accountNumber,
      destinationAccountName: input.accountName,
      amount: input.amount,
      narration: input.narration,
      reference: input.reference,
    },
  ];
  const paths = ["/transfers", "/payouts", "/disbursements", "/virtual-accounts/transfers"];
  let lastError = "Could not send payout.";
  for (const path of paths) {
    for (const body of bodies) {
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

export type CorvActivity = {
  amount: number;
  reference: string;
  accountNumber: string | null;
  createdAt: string | null;
  direction: "in" | "out";
  description: string;
};

function numberField(source: Json | null, keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value.replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function parseAmount(data: Json | null): number | null {
  if (!data) return null;
  const kobo = numberField(data, ["amountKobo", "amount_kobo"]);
  if (kobo != null && kobo >= 100) return kobo / 100;
  const amount = numberField(data, [
    "amount",
    "amount_ngn",
    "settled_amount",
    "settledAmount",
    "paidAmount",
    "creditAmount",
    "netAmount",
    "originatoramount",
    "available_balance",
    "availableBalance",
    "balance",
  ]);
  if (amount != null) return amount;
  const inner = nested(data, ["transaction", "charge", "wallet"]);
  return inner && inner !== data ? parseAmount(inner) : null;
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
  if (event && /payout|transfer\.(success|completed)|withdrawal/i.test(event) && !/credit|collection|virtual|payment|inflow/i.test(event)) {
    return null;
  }
  const data = nested(root, ["data", "payload", "result", "transaction"]) ?? root;
  const amount = parseAmount(data);
  if (amount == null) return null;
  const status = pickString(data, ["status"]) ?? "success";
  if (status && /fail|reject|cancel/i.test(status)) return null;
  return {
    amount,
    accountNumber: pickString(data, [
      "accountNumber",
      "account_number",
      "virtual_account_number",
      "destination_account_number",
      "nuban",
    ]),
    reference: pickString(data, ["reference", "id", "session_id", "sessionId", "flw_ref", "tx_ref", "transactionId"]),
    businessReference: pickString(data, ["account_reference", "accountReference", "customer_reference"]),
  };
}

function parseActivityRow(json: unknown): CorvActivity | null {
  const data = asRecord(json);
  const amount = parseAmount(data);
  const reference = pickString(data, ["reference", "id", "sessionId", "session_id", "transactionId"]);
  if (amount == null || !reference) return null;
  const type = `${pickString(data, ["type", "event", "direction", "transactionType"]) ?? ""} ${pickString(data, ["status"]) ?? ""}`;
  const outgoing = /payout|debit|withdraw|transfer|outflow/i.test(type);
  return {
    amount,
    reference,
    accountNumber: pickString(data, ["accountNumber", "account_number", "nuban"]),
    createdAt: pickString(data, ["createdAt", "created_at", "paidAt", "timestamp", "date"]),
    direction: outgoing ? "out" : "in",
    description: pickString(data, ["narration", "description", "remark"]) ?? (outgoing ? "Withdrawal" : "Money in"),
  };
}

function collectArrays(json: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(json)) {
    found.push(json);
    for (const item of json) collectArrays(item, found);
    return found;
  }
  const root = asRecord(json);
  if (!root) return found;
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) found.push(value);
    else if (value && typeof value === "object") collectArrays(value, found);
  }
  return found;
}

function parseActivityList(json: unknown): CorvActivity[] {
  const rows: CorvActivity[] = [];
  const one = parseActivityRow(json);
  if (one) rows.push(one);
  for (const list of collectArrays(json)) {
    for (const item of list) {
      const row = parseActivityRow(item);
      if (row && !rows.some((existing) => existing.reference === row.reference)) rows.push(row);
    }
  }
  return rows;
}

export async function corvMerchantBalance(): Promise<number | null> {
  const paths = ["/wallet", "/wallets", "/balance", "/merchant/wallet", "/merchant/balance", "/virtual-accounts/balance"];
  for (const path of paths) {
    const result = await corvFetch(path);
    if ("error" in result || !result.res.ok) continue;
    const root = asRecord(result.json);
    const data = nested(root, ["data", "wallet", "result"]) ?? root;
    const amount = parseAmount(data);
    if (amount != null) return amount;
  }
  return null;
}

export async function corvAccountActivity(
  accountNumber: string,
  accountId?: string | null,
  depth = 0,
): Promise<CorvActivity[]> {
  const nuban = accountNumber.trim();
  if (!nuban) return [];
  const encoded = encodeURIComponent(nuban);
  const paths = [
    accountId ? `/virtual-accounts/${accountId}/transactions` : null,
    accountId ? `/virtual-accounts/${accountId}/payments` : null,
    `/virtual-accounts/${encoded}/transactions`,
    `/virtual-accounts/${encoded}/payments`,
    `/virtual-accounts?search=${encoded}`,
    `/virtual-accounts?accountNumber=${encoded}`,
    `/transactions?accountNumber=${encoded}`,
    `/transactions?nuban=${encoded}`,
    `/payments?accountNumber=${encoded}`,
    `/collections?accountNumber=${encoded}`,
    `/wallet/transactions?accountNumber=${encoded}`,
    `/wallets/transactions`,
    `/transactions`,
  ].filter(Boolean) as string[];
  const rows: CorvActivity[] = [];
  for (const path of paths) {
    const result = await corvFetch(path);
    if ("error" in result || !result.res.ok) continue;
    const parsed = parseActivityList(result.json).filter(
      (row) => !row.accountNumber || row.accountNumber === nuban || path.includes("wallet") || path.endsWith("/transactions"),
    );
    for (const row of parsed) {
      const matches = !row.accountNumber || row.accountNumber === nuban;
      if (!matches && !path.includes(encoded)) continue;
      if (!rows.some((existing) => existing.reference === row.reference)) {
        rows.push({ ...row, accountNumber: row.accountNumber || nuban });
      }
    }
    const found = parseOneAccount(result.json) ?? parseAccountList(result.json).find((row) => row.accountNumber === nuban);
    if (found?.id && found.id !== accountId && depth < 1) {
      const nestedTx = await corvAccountActivity(nuban, found.id, depth + 1);
      for (const row of nestedTx) {
        if (!rows.some((existing) => existing.reference === row.reference)) rows.push(row);
      }
    }
  }
  return rows;
}

export function corvRequestLooksSigned(request: Request, raw: string): boolean {
  if (corvWebhookOk(request, raw)) return true;
  const secret = corvSecret();
  if (!secret) return false;
  const header = request.headers.get("x-api-key") || request.headers.get("api-key");
  return Boolean(header && header === secret);
}
