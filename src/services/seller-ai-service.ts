import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type InsightKind = "profile_view" | "call_click" | "whatsapp_click";

export type WeeklyInsightStats = {
  profileViews: number;
  callClicks: number;
  whatsappClicks: number;
  salesTotal: number;
  salesCount: number;
  weekStart: string;
};

export function currentWeekStart(): string {
  const now = new Date();
  const diff = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function recordBusinessInsight(businessId: string, kind: InsightKind): Promise<void> {
  try {
    if (typeof window !== "undefined" && kind === "profile_view") {
      const key = `tijar-shop-view-${businessId}`;
      const last = Number(sessionStorage.getItem(key) ?? "0");
      if (Number.isFinite(last) && Date.now() - last < 20 * 60 * 1000) return;
      sessionStorage.setItem(key, String(Date.now()));
    }
    const supabase = getSupabaseBrowserClient();
    await supabase.rpc("record_business_insight", {
      p_business_id: businessId,
      p_kind: kind,
    });
  } catch {
    /* tracking must never break the storefront */
  }
}

export async function fetchWeeklyInsightStats(businessId: string): Promise<WeeklyInsightStats> {
  const weekStart = currentWeekStart();
  const since = `${weekStart}T00:00:00`;
  const supabase = getSupabaseBrowserClient();
  const [events, sales] = await Promise.all([
    supabase
      .from("business_insight_events")
      .select("kind")
      .eq("business_id", businessId)
      .gte("created_at", since),
    supabase
      .from("transactions")
      .select("amount, type")
      .eq("business_id", businessId)
      .eq("type", "sale")
      .gte("occurred_at", since),
  ]);

  const kinds = (events.data ?? []) as Array<{ kind: string }>;
  const saleRows = (sales.data ?? []) as Array<{ amount: number; type: string }>;
  return {
    weekStart,
    profileViews: kinds.filter((r) => r.kind === "profile_view").length,
    callClicks: kinds.filter((r) => r.kind === "call_click").length,
    whatsappClicks: kinds.filter((r) => r.kind === "whatsapp_click").length,
    salesCount: saleRows.length,
    salesTotal: saleRows.reduce((sum, r) => sum + Number(r.amount || 0), 0),
  };
}

export async function saveWeeklyReport(input: {
  businessId: string;
  stats: WeeklyInsightStats;
  tipEn: string;
  tipHa: string;
  summaryEn: string;
  summaryHa: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("seller_weekly_reports").upsert(
    {
      business_id: input.businessId,
      week_start: input.stats.weekStart,
      profile_views: input.stats.profileViews,
      call_clicks: input.stats.callClicks,
      whatsapp_clicks: input.stats.whatsappClicks,
      sales_total: input.stats.salesTotal,
      sales_count: input.stats.salesCount,
      tip_en: input.tipEn,
      tip_ha: input.tipHa,
      summary_en: input.summaryEn,
      summary_ha: input.summaryHa,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,week_start" },
  );
  return { error: error?.message ?? null };
}

export async function fetchSavedWeeklyReport(businessId: string, weekStart: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("seller_weekly_reports")
    .select("*")
    .eq("business_id", businessId)
    .eq("week_start", weekStart)
    .maybeSingle();
  return { data, error: error?.message ?? null };
}

export async function updateShopLocation(
  businessId: string,
  location: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      location_text: location,
      public_location_label: location,
    })
    .eq("id", businessId);
  return { error: error?.message ?? null };
}
