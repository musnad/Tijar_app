import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { readEnvString } from "@/lib/supabase/runtime-env";

export function africastalkingConfig() {
  const username = (readEnvString("AFRICASTALKING_USERNAME") || "sandbox").trim();
  const apiKey = (readEnvString("AFRICASTALKING_API_KEY") || readEnvString("AT_API_KEY") || "").trim();
  const ussdCode = (readEnvString("AFRICASTALKING_USSD_CODE") || "*384*100#").trim();
  const sandbox = username === "sandbox" || readEnvString("AFRICASTALKING_ENV") === "sandbox";
  return { username, apiKey, ussdCode, sandbox };
}

export function ussdCallbackUrl(): string {
  return `${PRODUCTION_ORIGIN}/api/ussd/africastalking`;
}
