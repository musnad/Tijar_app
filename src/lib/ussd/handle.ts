import { africastalkingConfig } from "@/lib/ussd/config";
import { createShopFromUssd, findShopByPhone } from "@/lib/ussd/create-shop";
import { formatUssdBody, ussdMenu } from "@/lib/ussd/menu";
import { parseAfricastalkingUssd } from "@/lib/ussd/parse-request";
import { sendAfricastalkingSms } from "@/lib/ussd/sms";

function ussdResponse(screen: { continue: boolean; message: string; hop: string }) {
  const body = formatUssdBody(screen).replace(/^\uFEFF/, "").trimStart();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "at-ussd-hop-metadata": screen.hop.slice(0, 99).replace(/\|/g, "-"),
    },
  });
}

function homeScreen() {
  return ussdMenu({ text: "", ussdCode: africastalkingConfig().ussdCode });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function handleAfricastalkingUssd(request: Request): Promise<Response> {
  try {
    const payload = await parseAfricastalkingUssd(request);
    const { ussdCode } = africastalkingConfig();
    const needsShopLookup = payload.text.trim() === "2" || payload.text.trim().startsWith("2*");
    const existingShopUrl = needsShopLookup
      ? await withTimeout(findShopByPhone(payload.phoneNumber).catch(() => null), 2500, null)
      : null;
    const screen = ussdMenu({
      text: payload.text,
      existingShopUrl,
      ussdCode,
    });

    if (!screen.create) return ussdResponse(screen);

    const created = await withTimeout(
      createShopFromUssd(screen.create, payload.phoneNumber).catch(() => ({
        ok: false as const,
        error: "timeout",
      })),
      8000,
      { ok: false as const, error: "timeout" },
    );
    if (!created.ok) {
      return ussdResponse({
        continue: false,
        hop: "create-error",
        message: "Could not save the shop. Try again later.",
      });
    }

    const sms = `TIJAR shop is live ${created.url} Login ${created.email} Pass ${created.password}`;
    const sent = await withTimeout(sendAfricastalkingSms(payload.phoneNumber, sms), 2500, {
      ok: false,
      error: "timeout",
    });
    const extra = sent.ok
      ? "We sent your login by SMS."
      : `Email ${created.email}\nPass ${created.password}`;
    return ussdResponse({
      continue: false,
      hop: "created",
      message: `Shop is live.\n${created.url}\n${extra}`,
    });
  } catch (error) {
    console.error("ussd callback failed", error);
    return ussdResponse({
      continue: true,
      hop: "error",
      message: homeScreen().message,
    });
  }
}
