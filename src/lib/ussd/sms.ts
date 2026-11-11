import { africastalkingConfig } from "@/lib/ussd/config";

export async function sendAfricastalkingSms(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const { username, apiKey, sandbox } = africastalkingConfig();
  if (!apiKey) return { ok: false, error: "Africa's Talking key is missing." };
  const host = sandbox ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  const body = new URLSearchParams({
    username,
    to,
    message,
  });
  const res = await fetch(`${host}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: text.slice(0, 200) || `SMS HTTP ${res.status}` };
  }
  return { ok: true };
}
