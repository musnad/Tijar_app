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

function pickDeepString(source: unknown, keys: string[], depth = 0): string | null {
  if (depth > 4 || source == null) return null;
  const rec = asRecord(source);
  if (rec) {
    const direct = pickString(rec, keys);
    if (direct) return direct;
    for (const value of Object.values(rec)) {
      const found = pickDeepString(value, keys, depth + 1);
      if (found) return found;
    }
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      const found = pickDeepString(item, keys, depth + 1);
      if (found) return found;
    }
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
      signal: init.signal ?? AbortSignal.timeout(8000),
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

function transferAccepted(res: Response, json: unknown): boolean {
  if (res.status === 200 || res.status === 201 || res.status === 202) return true;
  const root = asRecord(json);
  const status = `${pickString(root, ["status", "state"]) ?? ""} ${pickString(nested(root, ["data"]), ["status", "state"]) ?? ""}`;
  return /success|pending|processing|queued|accepted/i.test(status);
}

export async function corvResolveAccount(input: {
  bankCode: string;
  accountNumber: string;
}): Promise<string | null> {
  const query = `accountNumber=${encodeURIComponent(input.accountNumber)}&bankCode=${encodeURIComponent(input.bankCode)}`;
  const gets = [`/name-enquiry?${query}`, `/transfers/name-enquiry?${query}`, `/resolve?${query}`];
  for (const path of gets) {
    const result = await corvFetch(path);
    if ("error" in result || !result.res.ok) continue;
    const data = nested(asRecord(result.json), ["data", "result"]) ?? asRecord(result.json);
    const name = pickString(data, ["accountName", "account_name", "name"]);
    if (name) return name;
  }
  const posts = ["/name-enquiry", "/transfers/name-enquiry", "/resolve"];
  for (const path of posts) {
    const result = await corvFetch(path, {
      method: "POST",
      body: JSON.stringify({ accountNumber: input.accountNumber, bankCode: input.bankCode }),
    });
    if ("error" in result || !result.res.ok) continue;
    const data = nested(asRecord(result.json), ["data", "result"]) ?? asRecord(result.json);
    const name = pickString(data, ["accountName", "account_name", "name"]);
    if (name) return name;
  }
  return null;
}

export async function corvTransfer(input: {
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  amount: number;
  reference: string;
  narration: string;
  sourceAccountNumber?: string;
}): Promise<CorvTransferResult> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const kobo = Math.round(amount * 100);
  const name = input.accountName?.trim() || undefined;
  const source = input.sourceAccountNumber?.replace(/\D/g, "") || undefined;
  const bodies: Json[] = [
    {
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      accountName: name,
      amount,
      narration: input.narration,
      reference: input.reference,
      currency: "NGN",
      ...(source ? { sourceAccountNumber: source, virtualAccountNumber: source } : {}),
    },
    {
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      account_name: name,
      amount,
      narration: input.narration,
      reference: input.reference,
      currency: "NGN",
      ...(source ? { source_account_number: source, virtual_account_number: source } : {}),
    },
    {
      account_bank: input.bankCode,
      account_number: input.accountNumber,
      account_name: name,
      amount,
      narration: input.narration,
      reference: input.reference,
      currency: "NGN",
    },
    {
      destinationBankCode: input.bankCode,
      destinationAccountNumber: input.accountNumber,
      destinationAccountName: name,
      amount,
      narration: input.narration,
      reference: input.reference,
      currency: "NGN",
    },
    {
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      accountName: name,
      amount: kobo,
      amountKobo: kobo,
      narration: input.narration,
      reference: input.reference,
      currency: "NGN",
    },
    {
      recipient: {
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        accountName: name,
      },
      amount,
      narration: input.narration,
      reference: input.reference,
      currency: "NGN",
    },
  ];
  const paths = [
    "/transfers",
    "/transfer",
    "/payouts",
    "/payout",
    "/disbursements",
    "/wallet/transfers",
    "/wallets/transfer",
  ];
  let lastError = "Could not send the withdrawal through Corvi.";
  for (const path of paths) {
    for (const body of bodies) {
      const result = await corvFetch(path, { method: "POST", body: JSON.stringify(body) });
      if ("error" in result) {
        lastError = result.error;
        continue;
      }
      if (result.res.status === 404 || result.res.status === 405) break;
      if (!result.res.ok && !transferAccepted(result.res, result.json)) {
        lastError = messageFrom(result.json, lastError);
        continue;
      }
      if (result.res.ok || transferAccepted(result.res, result.json)) {
        const root = asRecord(result.json);
        const data = nested(root, ["data", "result"]) ?? root;
        return {
          reference: pickString(data, ["reference", "id", "transfer_code", "session_id"]) ?? input.reference,
          error: null,
        };
      }
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
  ]);
  if (amount != null) return amount;
  const inner = nested(data, ["transaction", "charge"]);
  return inner && inner !== data ? parseAmount(inner) : null;
}

function pickReceivingNuban(data: Json | null): string | null {
  if (!data) return null;
  const dest = nested(data, [
    "virtualAccount",
    "virtual_account",
    "destinationAccount",
    "destination_account",
    "destination",
    "beneficiary",
    "creditedAccount",
    "receiver",
  ]);
  const candidates = [
    pickString(dest, ["accountNumber", "account_number", "nuban", "number"]),
    pickString(data, [
      "virtualAccountNumber",
      "virtual_account_number",
      "destinationAccountNumber",
      "destination_account_number",
      "creditedAccountNumber",
      "receiverAccountNumber",
      "nuban",
    ]),
  ];
  const originator = pickString(data, [
    "originatorAccountNumber",
    "originator_account_number",
    "sourceAccountNumber",
    "senderAccountNumber",
  ]);
  const generic = pickString(data, ["accountNumber", "account_number"]);
  if (generic && !originator) candidates.push(generic);
  for (const value of candidates) {
    const nuban = (value ?? "").replace(/\D/g, "");
    if (nuban.length >= 8 && !sameNuban(nuban, originator)) return nuban;
  }
  return null;
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
  const amount = parseAmount(data) ?? parseAmount(root);
  if (amount == null) return null;
  const status = pickString(data, ["status"]) ?? pickString(root, ["status"]) ?? "success";
  if (status && /fail|reject|cancel/i.test(status)) return null;
  return {
    amount,
    accountNumber: pickReceivingNuban(data) ?? pickReceivingNuban(root),
    reference: pickString(data, ["reference", "id", "session_id", "sessionId", "flw_ref", "tx_ref", "transactionId", "sessionid"]),
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
    accountNumber: pickReceivingNuban(data),
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

export function sameNuban(left?: string | null, right?: string | null): boolean {
  const a = (left ?? "").replace(/\D/g, "");
  const b = (right ?? "").replace(/\D/g, "");
  return a.length >= 8 && a === b;
}

async function resolveVirtualAccountId(nuban: string, storedId?: string | null): Promise<string | null> {
  const encoded = encodeURIComponent(nuban);
  if (storedId?.trim()) {
    const result = await corvFetch(`/virtual-accounts/${encodeURIComponent(storedId.trim())}`);
    if (!("error" in result) && result.res.ok) {
      const found = parseOneAccount(result.json);
      if (found && sameNuban(found.accountNumber, nuban) && found.id) return found.id;
    }
  }
  for (const path of [`/virtual-accounts?accountNumber=${encoded}`, `/virtual-accounts?search=${encoded}`, `/virtual-accounts`]) {
    const result = await corvFetch(path);
    if ("error" in result || !result.res.ok) continue;
    const found = parseAccountList(result.json).find((row) => sameNuban(row.accountNumber, nuban));
    if (found?.id && sameNuban(found.accountNumber, nuban)) return found.id;
  }
  return null;
}

export async function corvAccountActivity(
  accountNumber: string,
  accountId?: string | null,
): Promise<CorvActivity[]> {
  const nuban = accountNumber.replace(/\D/g, "");
  if (nuban.length < 8) return [];
  const resolvedId = await resolveVirtualAccountId(nuban, accountId);
  if (!resolvedId) return [];
  const paths = [`/virtual-accounts/${resolvedId}/transactions`, `/virtual-accounts/${resolvedId}/payments`];
  const rows: CorvActivity[] = [];
  for (const path of paths) {
    const result = await corvFetch(path);
    if ("error" in result || !result.res.ok) continue;
    for (const row of parseActivityList(result.json)) {
      if (row.accountNumber && !sameNuban(row.accountNumber, nuban)) continue;
      const stamped = { ...row, accountNumber: row.accountNumber || nuban };
      if (!rows.some((existing) => existing.reference === stamped.reference)) rows.push(stamped);
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
