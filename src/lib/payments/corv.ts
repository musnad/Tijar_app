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
    (root?.items && Array.isArray(root.items) ? root.items : null) ||
    (root?.data && Array.isArray(root.data) ? root.data : null) ||
    (root?.accounts && Array.isArray(root.accounts) ? root.accounts : null) ||
    (nested(root, ["data"]) && Array.isArray(nested(root, ["data"])?.items)
      ? (nested(root, ["data"])!.items as unknown[])
      : null) ||
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
      signal: init.signal ?? AbortSignal.timeout(12000),
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
  body.callBackUrl = "https://www.tijar.ng/api/payments/webhook";

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
  const body = JSON.stringify({ accountNumber: input.accountNumber, bankCode: input.bankCode });
  for (const path of ["/bank-transfer/verify", "/wallet/name-enquiry"]) {
    const result = await corvFetch(path, { method: "POST", body });
    if ("error" in result || !result.res.ok) continue;
    const data = nested(asRecord(result.json), ["data", "result"]) ?? asRecord(result.json);
    const name = pickString(data, ["accountName", "account_name", "creditAccountName", "name"]);
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
  const name = input.accountName?.trim() || undefined;
  const body: Json = {
    amount,
    bankCode: input.bankCode,
    accountNumber: input.accountNumber,
    accountName: name,
    narration: input.narration,
    reference: input.reference,
  };
  const result = await corvFetch("/bank-transfer/transfer", { method: "POST", body: JSON.stringify(body) });
  if ("error" in result) return { reference: null, error: payoutPermissionError(result.error) };
  if (result.res.ok || transferAccepted(result.res, result.json)) {
    const root = asRecord(result.json);
    const data = nested(root, ["data", "result"]) ?? root;
    return {
      reference: pickString(data, ["reference", "id", "transfer_code", "session_id"]) ?? input.reference,
      error: null,
    };
  }
  return {
    reference: null,
    error: payoutPermissionError(messageFrom(result.json, "Could not send the withdrawal through Corvi.")),
  };
}

function payoutPermissionError(message: string): string {
  if (/payouts? permission|allowedIps|allowed ips/i.test(message)) {
    return "Corvi blocked this withdrawal because this API key has no payouts permission. In the Corvi dashboard create a Production API key, enable payouts, restrict it to your server IPs, then replace CORV_SECRET_KEY on Vercel and redeploy. Until then, send the money from the Corvi wallet screen.";
  }
  return message;
}

function signatureMatch(expected: string, header: string, raw: string): boolean {
  const provided = header.replace(/^sha256=/i, "").trim();
  const hex = createHmac("sha256", expected).update(raw).digest("hex");
  const candidates = [hex, createHmac("sha256", expected).update(raw).digest("base64")];
  return candidates.some((digest) => {
    try {
      const a = Buffer.from(digest);
      const b = Buffer.from(provided);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export function corvWebhookOk(request: Request, raw: string, extraSecret?: string): boolean {
  const header =
    request.headers.get("x-corv-signature") ||
    request.headers.get("x-webhook-signature") ||
    request.headers.get("x-signature") ||
    request.headers.get("corv-signature") ||
    request.headers.get("x-corvi-signature");
  if (!header) return false;
  const secrets = [extraSecret, corvWebhookSecret()].filter((value): value is string => Boolean(value));
  return secrets.some((secret) => signatureMatch(secret, header, raw));
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
    "settlement_amount",
    "settlementAmount",
    "net_amount",
    "netAmount",
    "amount_paid",
    "amountPaid",
    "amount",
    "amount_ngn",
    "settled_amount",
    "settledAmount",
    "paidAmount",
    "creditAmount",
  ]);
  if (amount != null) return amount;
  const inner = nested(data, ["transaction", "charge", "payload", "data"]);
  return inner && inner !== data ? parseAmount(inner) : null;
}

function pickReceivingNuban(data: Json | null): string | null {
  if (!data) return null;
  const dest = nested(data, [
    "receiver",
    "virtualAccount",
    "virtual_account",
    "destinationAccount",
    "destination_account",
    "destination",
    "beneficiary",
    "creditedAccount",
  ]);
  const sender = nested(data, ["sender", "originator", "source"]);
  const originator =
    pickString(sender, ["account_number", "accountNumber"]) ||
    pickString(data, [
      "originatorAccountNumber",
      "originator_account_number",
      "sourceAccountNumber",
      "senderAccountNumber",
    ]);
  const candidates = [
    pickString(dest, ["account_number", "accountNumber", "nuban", "number"]),
    pickString(data, [
      "virtualAccountNumber",
      "virtual_account_number",
      "destinationAccountNumber",
      "destination_account_number",
      "creditedAccountNumber",
      "receiverAccountNumber",
    ]),
  ];
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
  if (event && /payout|transfer\.(success|completed)|withdrawal|virtual_account\.(created|disabled|expired)/i.test(event) && !/payment|funding|credit|collection|inflow/i.test(event)) {
    return null;
  }
  const data = nested(root, ["data", "payload", "result", "transaction"]) ?? root;
  const status =
    pickString(data, ["transaction_status", "notification_status", "status"]) ??
    pickString(root, ["transaction_status", "status"]) ??
    "success";
  if (status && /fail|reject|cancel/i.test(status) && !/payment_successful|success/i.test(status)) return null;
  const amount = parseAmount(data) ?? parseAmount(root);
  if (amount == null) return null;
  return {
    amount,
    accountNumber: pickReceivingNuban(data) ?? pickReceivingNuban(root),
    reference:
      pickString(data, ["transaction_id", "reference", "id", "session_id", "sessionId", "rubiesReference"]) ||
      pickString(root, ["transaction_id", "reference", "id"]),
    businessReference: pickString(data, ["account_reference", "accountReference", "customer_reference"]),
  };
}

function paymentBody(json: unknown): Json | null {
  const root = asRecord(json);
  if (!root) return null;
  return nested(root, ["payload", "data", "result"]) ?? root;
}

function parseActivityRow(json: unknown): CorvActivity | null {
  const credit = parseCorvCredit(json);
  if (!credit?.reference) return null;
  const body = paymentBody(json);
  const sender = nested(body, ["sender"]);
  const from = pickString(sender, ["name"]);
  return {
    amount: credit.amount,
    reference: credit.reference,
    accountNumber: credit.accountNumber,
    createdAt:
      pickString(body, ["timestamp", "createdAt", "created_at", "processedAt"]) ??
      pickString(asRecord(json), ["createdAt", "created_at"]),
    direction: "in",
    description: from ? `Money in from ${from}` : "Money in",
  };
}

export function sameNuban(left?: string | null, right?: string | null): boolean {
  const a = (left ?? "").replace(/\D/g, "");
  const b = (right ?? "").replace(/\D/g, "");
  return a.length >= 8 && a === b;
}

let paymentInboxCache: { at: number; rows: CorvActivity[] } | null = null;

export async function corvReceivedPayments(): Promise<CorvActivity[]> {
  if (paymentInboxCache && Date.now() - paymentInboxCache.at < 8_000) return paymentInboxCache.rows;
  const rows: CorvActivity[] = [];
  for (let page = 1; page <= 8; page += 1) {
    const result = await corvFetch(`/webhooks/logs?page=${page}&limit=50`);
    if ("error" in result || !result.res.ok) break;
    const root = asRecord(result.json);
    const items = Array.isArray(root?.items) ? root.items : [];
    for (const item of items) {
      const rec = asRecord(item);
      const event = pickString(rec, ["event"]) ?? "";
      if (event && !/payment\.received|virtual_account\.payment/i.test(event)) continue;
      const row = parseActivityRow(item) ?? parseActivityRow(rec?.payload);
      if (!row?.accountNumber) continue;
      if (!rows.some((existing) => existing.reference === row.reference)) rows.push(row);
    }
    const pages = Number(root?.pages ?? 1);
    if (page >= pages || items.length === 0) break;
  }
  paymentInboxCache = { at: Date.now(), rows };
  return rows;
}

export async function corvAccountActivity(accountNumber: string, _accountId?: string | null): Promise<CorvActivity[]> {
  const nuban = accountNumber.replace(/\D/g, "");
  if (nuban.length < 8) return [];
  const inbox = await corvReceivedPayments();
  return inbox.filter((row) => sameNuban(row.accountNumber, nuban));
}

export async function corvWebhookConfigSecret(): Promise<string | undefined> {
  const result = await corvFetch("/webhooks/config");
  if ("error" in result || !result.res.ok) return undefined;
  return pickString(asRecord(result.json), ["webhookSecret", "secret"]) ?? undefined;
}

export function corvRequestLooksSigned(request: Request, raw: string): boolean {
  if (corvWebhookOk(request, raw)) return true;
  const secret = corvSecret();
  if (!secret) return false;
  const header = request.headers.get("x-api-key") || request.headers.get("api-key");
  return Boolean(header && header === secret);
}
