import { readEnvString } from "@/lib/supabase/runtime-env";

const FLW_URL = "https://api.flutterwave.com/v3";

export function flutterwaveSecret(): string | undefined {
  return readEnvString("FLUTTERWAVE_SECRET_KEY");
}

export function flutterwaveWebhookHash(): string | undefined {
  return readEnvString("FLUTTERWAVE_WEBHOOK_HASH") || flutterwaveSecret();
}

export function flutterwaveConfigured(): boolean {
  return Boolean(flutterwaveSecret());
}

export function flutterwaveWebhookOk(header: string | null): boolean {
  const expected = flutterwaveWebhookHash();
  if (!expected || !header) return false;
  return header === expected;
}

export async function flutterwaveCreatePayment(input: {
  txRef: string;
  amount: number;
  email: string;
  name: string;
  phone?: string;
  redirectUrl: string;
  orderId: string;
  businessId: string;
}): Promise<{ link: string | null; error: string | null }> {
  const secret = flutterwaveSecret();
  if (!secret) return { link: null, error: "Flutterwave is not connected yet." };
  const res = await fetch(`${FLW_URL}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: input.txRef,
      amount: input.amount,
      currency: "NGN",
      redirect_url: input.redirectUrl,
      customer: {
        email: input.email,
        name: input.name,
        phonenumber: input.phone || undefined,
      },
      customizations: {
        title: "TIJAR",
        description: "Pay this shop on TIJAR",
      },
      meta: { order_id: input.orderId, business_id: input.businessId },
    }),
  });
  const json = (await res.json()) as { status?: string; message?: string; data?: { link?: string } };
  if (!res.ok || json.status !== "success" || !json.data?.link) {
    return { link: null, error: json.message || "Could not start Flutterwave." };
  }
  return { link: json.data.link, error: null };
}

export async function flutterwaveTransfer(input: {
  bankCode: string;
  accountNumber: string;
  amount: number;
  reference: string;
  narration: string;
}): Promise<{ reference: string | null; error: string | null }> {
  const secret = flutterwaveSecret();
  if (!secret) return { reference: null, error: "Flutterwave is not connected yet." };
  const res = await fetch(`${FLW_URL}/transfers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_bank: input.bankCode,
      account_number: input.accountNumber,
      amount: input.amount,
      narration: input.narration,
      currency: "NGN",
      reference: input.reference,
      debit_currency: "NGN",
    }),
  });
  const json = (await res.json()) as {
    status?: string;
    message?: string;
    data?: { reference?: string; id?: number };
  };
  if (!res.ok || json.status !== "success") {
    return { reference: null, error: json.message || "Could not send payout." };
  }
  return { reference: json.data?.reference ?? String(json.data?.id ?? input.reference), error: null };
}

export async function flutterwaveCreateVirtualAccount(input: {
  reference: string;
  accountName: string;
  email: string;
  phone?: string;
  bvn?: string;
}): Promise<{
  account: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string | null;
    reference: string | null;
  } | null;
  error: string | null;
  needsBvn?: boolean;
}> {
  const secret = flutterwaveSecret();
  if (!secret) return { account: null, error: "Flutterwave is not connected yet." };
  const body: Record<string, unknown> = {
    email: input.email,
    is_permanent: true,
    tx_ref: input.reference,
    narration: input.accountName,
    phonenumber: input.phone || undefined,
  };
  if (input.bvn) body.bvn = input.bvn;
  const res = await fetch(`${FLW_URL}/virtual-account-numbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    status?: string;
    message?: string;
    data?: {
      account_number?: string;
      account_name?: string;
      bank_name?: string;
      bank_code?: string;
      flw_ref?: string;
      order_ref?: string;
      note?: string;
    };
  };
  const message = json.message || json.data?.note || "Could not create a receiving account.";
  if (!res.ok || json.status !== "success" || !json.data?.account_number) {
    return {
      account: null,
      error: message,
      needsBvn: /bvn|nin|kyc|identity/i.test(message),
    };
  }
  return {
    account: {
      accountNumber: json.data.account_number,
      accountName: json.data.account_name || input.accountName,
      bankName: json.data.bank_name || "Flutterwave",
      bankCode: json.data.bank_code ?? null,
      reference: json.data.order_ref || json.data.flw_ref || input.reference,
    },
    error: null,
  };
}
