"use client";

import { useEffect, useState } from "react";

import { aiFetch } from "@/lib/ai/client-fetch";
import { useTranslation } from "@/lib/i18n/context";

export function AiCreditsBar() {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<number | null>(null);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await aiFetch("/api/ai/wallet");
        const body = (await res.json().catch(() => null)) as { balance?: number | null } | null;
        if (cancelled) return;
        if (!res.ok || body?.balance == null) {
          setReady(false);
          return;
        }
        setBalance(body.balance);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <p className="text-xs text-muted-foreground">{t("app.ai.creditsUnavailable")}</p>;
  }
  if (balance == null) return null;
  return (
    <p className="rounded-xl bg-muted px-3 py-2 text-sm font-semibold text-[#0A2540]">
      {t("app.ai.credits").replace("{n}", String(balance))}
    </p>
  );
}
