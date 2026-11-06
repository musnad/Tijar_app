/**
 * Payment provider adapter.
 *
 * Live Paystack / Flutterwave keys are server-only (no VITE_ prefix).
 * Until those secrets exist, checkout creates labelled order requests
 * and never marks an order paid from the browser.
 *
 * Missing setup (add to the host, never commit values):
 * - PAYSTACK_SECRET_KEY + PAYSTACK_PUBLIC_KEY  https://paystack.com/docs
 * - or FLUTTERWAVE_SECRET_KEY + FLUTTERWAVE_PUBLIC_KEY
 * - HTTPS webhook on this app that verifies the provider signature and
 *   updates payments + orders (idempotent on provider_reference)
 */

export type PaymentProviderId = "none" | "paystack" | "flutterwave" | "corv";

export type PaymentAdapterStatus = {
  provider: PaymentProviderId;
  ready: boolean;
  checkoutMode: "order_request" | "live";
  missing: string[];
};

function serverSecret(name: string): string | undefined {
  const value = typeof process !== "undefined" ? process.env[name] : undefined;
  return value?.trim() || undefined;
}

export function getPaymentAdapterStatus(): PaymentAdapterStatus {
  const corvSecret = serverSecret("CORV_SECRET_KEY") || serverSecret("CORV_API_KEY");
  const paystackSecret = serverSecret("PAYSTACK_SECRET_KEY");
  const flutterSecret = serverSecret("FLUTTERWAVE_SECRET_KEY");
  if (corvSecret) {
    return {
      provider: "corv",
      ready: true,
      checkoutMode: "live",
      missing: [],
    };
  }
  if (flutterSecret) {
    return {
      provider: "flutterwave",
      ready: true,
      checkoutMode: "live",
      missing: [],
    };
  }
  if (paystackSecret) {
    return {
      provider: "paystack",
      ready: true,
      checkoutMode: "live",
      missing: [],
    };
  }
  return {
    provider: "none",
    ready: false,
    checkoutMode: "order_request",
    missing: [
      "CORV_SECRET_KEY (or FLUTTERWAVE_SECRET_KEY / PAYSTACK_SECRET_KEY)",
      "Webhook https://www.tijar.ng/api/payments/webhook",
    ],
  };
}

export function isLivePaymentConfigured(): boolean {
  return getPaymentAdapterStatus().ready;
}
