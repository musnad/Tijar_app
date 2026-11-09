import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { SupabaseClient } from "@supabase/supabase-js";

const scryptAsync = promisify(scrypt);
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

export type TransferPinCheck =
  | { ok: true }
  | { ok: false; status: number; error: string; code: string };

type PinRow = {
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
};

function pinTableMissing(error: { code?: string; message?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    msg.includes("seller_transfer_pins")
  );
}

export function digitsPin(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 4);
}

export function isWeakTransferPin(pin: string): boolean {
  if (pin.length !== 4) return true;
  if (/^(\d)\1{3}$/.test(pin)) return true;
  if (pin === "1234" || pin === "4321" || pin === "0123" || pin === "3210") return true;
  return false;
}

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(pin, salt, 32)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const key = (await scryptAsync(pin, salt, 32)) as Buffer;
    if (key.length !== expected.length) return false;
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

function lockMessage(until: string | null): string {
  const ms = until ? new Date(until).getTime() - Date.now() : 0;
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

async function loadPin(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ row: PinRow | null; missingTable: boolean }> {
  const { data, error } = await admin
    .from("seller_transfer_pins")
    .select("pin_hash, failed_attempts, locked_until")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error && pinTableMissing(error)) return { row: null, missingTable: true };
  if (error) return { row: null, missingTable: false };
  return { row: (data as PinRow | null) ?? null, missingTable: false };
}

export async function shopHasTransferPin(
  admin: SupabaseClient,
  businessId: string,
): Promise<{ hasPin: boolean; lockedUntil: string | null; missingTable: boolean }> {
  const { row, missingTable } = await loadPin(admin, businessId);
  return { hasPin: Boolean(row?.pin_hash), lockedUntil: row?.locked_until ?? null, missingTable };
}

export async function setShopTransferPin(
  admin: SupabaseClient,
  businessId: string,
  input: { pin: string; confirmPin: string; currentPin?: string },
): Promise<TransferPinCheck> {
  const pin = digitsPin(input.pin);
  const confirm = digitsPin(input.confirmPin);
  if (pin.length !== 4 || confirm.length !== 4) {
    return { ok: false, status: 400, error: "Enter a 4-digit transfer PIN.", code: "PIN_FORMAT" };
  }
  if (pin !== confirm) {
    return { ok: false, status: 400, error: "Those PINs do not match.", code: "PIN_MISMATCH" };
  }
  if (isWeakTransferPin(pin)) {
    return {
      ok: false,
      status: 400,
      error: "Choose a stronger PIN. Avoid 1234 or the same digit four times.",
      code: "PIN_WEAK",
    };
  }

  const { row, missingTable } = await loadPin(admin, businessId);
  if (missingTable) {
    return {
      ok: false,
      status: 503,
      error: "Run the transfer PIN SQL in Supabase, then try again.",
      code: "PIN_SQL",
    };
  }

  if (row?.pin_hash) {
    const current = digitsPin(input.currentPin);
    if (current.length !== 4) {
      return { ok: false, status: 400, error: "Enter your current PIN to change it.", code: "PIN_CURRENT" };
    }
    const checked = await consumeTransferPin(admin, businessId, current);
    if (!checked.ok) return checked;
  }

  const pin_hash = await hashPin(pin);
  const { error } = await admin.from("seller_transfer_pins").upsert(
    {
      business_id: businessId,
      pin_hash,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  );
  if (error) {
    if (pinTableMissing(error)) {
      return {
        ok: false,
        status: 503,
        error: "Run the transfer PIN SQL in Supabase, then try again.",
        code: "PIN_SQL",
      };
    }
    return { ok: false, status: 500, error: "Could not save the PIN. Try again.", code: "PIN_SAVE" };
  }
  return { ok: true };
}

export async function consumeTransferPin(
  admin: SupabaseClient,
  businessId: string,
  pinRaw: unknown,
): Promise<TransferPinCheck> {
  const pin = digitsPin(pinRaw);
  const { row, missingTable } = await loadPin(admin, businessId);
  if (missingTable) {
    return {
      ok: false,
      status: 503,
      error: "Run the transfer PIN SQL in Supabase, then try again.",
      code: "PIN_SQL",
    };
  }
  if (!row?.pin_hash) {
    return { ok: false, status: 403, error: "Set a transfer PIN before withdrawing.", code: "PIN_REQUIRED" };
  }
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { ok: false, status: 423, error: lockMessage(row.locked_until), code: "PIN_LOCKED" };
  }
  if (pin.length !== 4) {
    return { ok: false, status: 400, error: "Enter your 4-digit transfer PIN.", code: "PIN_FORMAT" };
  }

  const match = await pinMatches(pin, row.pin_hash);
  if (match) {
    await admin
      .from("seller_transfer_pins")
      .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return { ok: true };
  }

  const fails = Number(row.failed_attempts ?? 0) + 1;
  const locked_until = fails >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS).toISOString() : null;
  await admin
    .from("seller_transfer_pins")
    .update({ failed_attempts: fails, locked_until, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (locked_until) {
    return { ok: false, status: 423, error: lockMessage(locked_until), code: "PIN_LOCKED" };
  }
  const left = LOCK_AFTER - fails;
  return {
    ok: false,
    status: 403,
    error: `Wrong PIN. ${left} tr${left === 1 ? "y" : "ies"} left before this wallet locks.`,
    code: "PIN_INVALID",
  };
}
