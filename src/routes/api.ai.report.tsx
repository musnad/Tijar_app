import { createFileRoute } from "@tanstack/react-router";

import { fallbackReport, REPORT_SYSTEM, type ReportCopy } from "@/lib/ai/seller-extract";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { grokJson, isXaiConfigured, XaiError } from "@/lib/xai/client";

export const Route = createFileRoute("/api/ai/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to see your report." } }, { status: auth.status });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) {
          return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        }
        const parsed = await readJsonBody(request, 8_192);
        if (!parsed.ok) {
          return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        }
        const body = parsed.body as {
          profileViews?: number;
          callClicks?: number;
          whatsappClicks?: number;
          salesTotal?: number;
          salesCount?: number;
          language?: string;
        };
        const stats = {
          profileViews: num(body.profileViews),
          callClicks: num(body.callClicks),
          whatsappClicks: num(body.whatsappClicks),
          salesTotal: num(body.salesTotal),
          salesCount: num(body.salesCount),
        };
        try {
          const copy = isXaiConfigured()
            ? await grokJson<ReportCopy>({
                system: REPORT_SYSTEM,
                user: JSON.stringify({ ...stats, language: body.language || "English" }),
              })
            : fallbackReport(stats);
          return jsonSecure({ copy: sanitizeCopy(copy, stats), source: isXaiConfigured() ? "grok" : "local" });
        } catch (err) {
          const copy = fallbackReport(stats);
          if (err instanceof XaiError && err.code === "NOT_CONFIGURED") {
            return jsonSecure({ copy, source: "local" });
          }
          return jsonSecure({ copy, source: "local" });
        }
      },
    },
  },
});

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

function sanitizeCopy(copy: ReportCopy, stats: Parameters<typeof fallbackReport>[0]): ReportCopy {
  const fb = fallbackReport(stats);
  return {
    tipEn: (copy.tipEn || fb.tipEn).slice(0, 400),
    tipHa: (copy.tipHa || fb.tipHa).slice(0, 400),
    summaryEn: (copy.summaryEn || fb.summaryEn).slice(0, 500),
    summaryHa: (copy.summaryHa || fb.summaryHa).slice(0, 500),
  };
}
