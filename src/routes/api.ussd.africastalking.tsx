import { createFileRoute } from "@tanstack/react-router";

import { africastalkingConfig, ussdCallbackUrl } from "@/lib/ussd/config";
import { createShopFromUssd, findShopByPhone } from "@/lib/ussd/create-shop";
import { formatUssdBody, ussdMenu } from "@/lib/ussd/menu";
import { parseAfricastalkingUssd } from "@/lib/ussd/parse-request";
import { sendAfricastalkingSms } from "@/lib/ussd/sms";

function ussdResponse(screen: { continue: boolean; message: string; hop: string }) {
  return new Response(formatUssdBody(screen), {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "at-ussd-hop-metadata": screen.hop.slice(0, 99),
    },
  });
}

export const Route = createFileRoute("/api/ussd/africastalking")({
  server: {
    handlers: {
      GET: async () => {
        const { ussdCode, username, apiKey } = africastalkingConfig();
        return Response.json({
          service: "TIJAR USSD",
          callback: ussdCallbackUrl(),
          username,
          keyConfigured: Boolean(apiKey),
          ussdCode,
          simulator: "https://simulator.africastalking.com:1517/",
          setup: [
            "Open Africa's Talking sandbox and create a USSD channel.",
            `Set the callback URL to ${ussdCallbackUrl()}`,
            `Dial ${ussdCode} in the simulator, then pick 1 to open a shop.`,
          ],
        });
      },
      POST: async ({ request }) => {
        const payload = await parseAfricastalkingUssd(request);
        const { ussdCode } = africastalkingConfig();
        const existingShopUrl = payload.phoneNumber ? await findShopByPhone(payload.phoneNumber) : null;
        const screen = ussdMenu({
          text: payload.text,
          existingShopUrl,
          ussdCode,
        });

        if (!screen.create) return ussdResponse(screen);

        const created = await createShopFromUssd(screen.create, payload.phoneNumber);
        if (!created.ok) {
          return ussdResponse({
            continue: false,
            hop: "create-error",
            message: "Could not save the shop. Try again later.",
          });
        }

        const sms = `TIJAR shop is live ${created.url} Login ${created.email} Pass ${created.password}`;
        const sent = await sendAfricastalkingSms(payload.phoneNumber, sms);
        const extra = sent.ok
          ? "We sent your login by SMS."
          : `Email ${created.email}\nPass ${created.password}`;
        return ussdResponse({
          continue: false,
          hop: "created",
          message: `Shop is live.\n${created.url}\n${extra}`,
        });
      },
    },
  },
});
