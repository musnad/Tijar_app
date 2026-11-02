import { createFileRoute } from "@tanstack/react-router";

import { assertTranslateOrigin, clientIp, jsonSecure } from "@/lib/api/security";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { grokDownloadVideo, grokPollVideo, XaiError } from "@/lib/xai/client";

export const Route = createFileRoute("/api/studio/video/$requestId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        const limit = checkRateLimit(`studio-poll:${clientIp(request)}`, 40, 60_000);
        if (!limit.allowed) {
          return jsonSecure({ error: { code: "RATE_LIMITED", message: "Slow down." } }, { status: 429 });
        }
        const requestId = params.requestId;
        const download = new URL(request.url).searchParams.get("download") === "1";
        try {
          const poll = await grokPollVideo(requestId);
          if (download && poll.status === "done" && poll.url) {
            const file = await grokDownloadVideo(poll.url);
            return new Response(file.bytes, {
              status: 200,
              headers: {
                "Content-Type": file.contentType,
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
              },
            });
          }
          return jsonSecure(poll);
        } catch (err) {
          if (err instanceof XaiError) {
            return jsonSecure({ status: "failed", error: err.message }, { status: err.status });
          }
          return jsonSecure({ status: "failed", error: "Could not check the video." }, { status: 502 });
        }
      },
    },
  },
});
