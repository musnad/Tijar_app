import { createFileRoute } from "@tanstack/react-router";

import { handleAfricastalkingUssd } from "@/lib/ussd/handle";

/** Short alias so a saved callback cannot 404 if the long path is mistyped. */
export const Route = createFileRoute("/api/ussd")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAfricastalkingUssd(request),
      POST: async ({ request }) => handleAfricastalkingUssd(request),
    },
  },
});
