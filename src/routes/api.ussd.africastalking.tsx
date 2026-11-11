import { createFileRoute } from "@tanstack/react-router";

import { africastalkingConfig, ussdCallbackUrl } from "@/lib/ussd/config";
import { handleAfricastalkingUssd } from "@/lib/ussd/handle";

export const Route = createFileRoute("/api/ussd/africastalking")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("setup") === "1") {
          const { ussdCode, username, apiKey } = africastalkingConfig();
          return Response.json({
            service: "TIJAR USSD",
            callback: ussdCallbackUrl(),
            username,
            keyConfigured: Boolean(apiKey),
            ussdCode,
            simulator: "https://simulator.africastalking.com:1517/",
            setup: [
              "Create a USSD channel in the Africa's Talking sandbox.",
              `Callback URL must be exactly ${ussdCallbackUrl()} (https and www).`,
              "Do not use tijar.ng without www — that redirect breaks the simulator.",
              `In the simulator dial ${ussdCode}`,
            ],
          });
        }
        return handleAfricastalkingUssd(request);
      },
      POST: async ({ request }) => handleAfricastalkingUssd(request),
    },
  },
});
