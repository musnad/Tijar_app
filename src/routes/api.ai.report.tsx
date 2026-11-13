import { createFileRoute } from "@tanstack/react-router";

import { fallbackReport, REPORT_SYSTEM, type ReportCopy } from "@/lib/ai/seller-extract";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
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
        const session = await startAiSession({ request, service: "report" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        try {
          let copy: ReportCopy;
          if (isXaiConfigured()) {
            const timed = await runTimedProvider(
              session,
              grokJson<ReportCopy>({
                system: REPORT_SYSTEM,
                user: JSON.stringify({ ...stats, language: body.language || "English" }),
              }),
            );
            if (!timed.ok) {
              const timeoutBody = { error: { code: "TIMEOUT", message: "TIJAR AI timed out." } };
              await session.saveReplay({ httpStatus: 504, body: timeoutBody });
              await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
              return jsonSecure(timeoutBody, { status: 504 });
            }
            copy = timed.value;
          } else {
            copy = fallbackReport(stats);
          }
          const okBody = { copy: sanitizeCopy(copy, stats), source: isXaiConfigured() ? "grok" : "local" };
          await session.saveReplay({ httpStatus: 200, body: okBody });
          await session.finish({ status: "succeeded", provider: isXaiConfigured() ? "xai" : "local" });
          return jsonSecure(okBody);
        } catch (err) {
          const copy = fallbackReport(stats);
          const localBody = { copy, source: "local" as const };
          await session.saveReplay({ httpStatus: 200, body: localBody });
          await session.finish({ status: "succeeded", provider: "local" });
          if (err instanceof XaiError && err.code === "NOT_CONFIGURED") {
            return jsonSecure(localBody);
          }
          return jsonSecure(localBody);
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
