"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { seoReadinessScore } from "@/lib/seo/eligibility";
import { SEO_KEYWORD_SEED } from "@/lib/seo/keywords";
import {
  fetchSeoKeywordAliases,
  updateBusinessSeoCopy,
  upsertSeoKeywordAlias,
  type AdminBusiness,
} from "@/services/admin-service";

export function SeoAdminPanel({ businesses }: { businesses: AdminBusiness[] }) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [englishLabel, setEnglishLabel] = useState("");
  const [categorySlug, setCategorySlug] = useState("street-food");
  const aliasesQuery = useQuery({
    queryKey: ["admin-seo-aliases"],
    queryFn: async () => {
      const { rows } = await fetchSeoKeywordAliases();
      return rows;
    },
  });

  const rows = useMemo(() => {
    return businesses.map((biz) => {
      const readiness = seoReadinessScore({
        isPublished: biz.is_published,
        slug: biz.public_slug,
        description: biz.description,
        logoUrl: biz.logo_url,
        coverUrl: biz.cover_image_url,
        location: biz.location,
        publicLocation: biz.public_location_label,
        categoryId: biz.category_id,
        publicPhone: biz.public_phone,
        publicWhatsapp: biz.public_whatsapp,
        moderationStatus: biz.moderation_status,
      });
      return { biz, readiness };
    });
  }, [businesses]);

  const publicCount = rows.filter((row) => row.biz.is_published && row.biz.public_slug).length;
  const eligible = rows.filter((row) => row.readiness.indexable).length;
  const missingDesc = rows.filter((row) => row.readiness.missing.includes("description")).length;
  const missingImage = rows.filter((row) => row.readiness.missing.includes("image")).length;
  const missingLocation = rows.filter((row) => row.readiness.missing.includes("location")).length;
  const slugCounts = new Map<string, number>();
  for (const row of rows) {
    const slug = row.biz.public_slug?.trim();
    if (!slug) continue;
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }
  const duplicateSlugs = [...slugCounts.entries()].filter(([, count]) => count > 1);

  async function onAddKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || !englishLabel.trim()) {
      toast.error("Keyword and English label are required.");
      return;
    }
    const { error } = await upsertSeoKeywordAlias({
      keyword,
      language: "ha",
      categorySlug,
      englishLabel,
    });
    if (error) {
      toast.error(error.includes("does not exist") ? "Run the SEO SQL migration first." : error);
      return;
    }
    toast.success("Keyword saved.");
    setKeyword("");
    setEnglishLabel("");
    await queryClient.invalidateQueries({ queryKey: ["admin-seo-aliases"] });
  }

  async function onSaveSeo(businessId: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const { error } = await updateBusinessSeoCopy(
      businessId,
      String(data.get("seo_title") ?? ""),
      String(data.get("seo_description") ?? ""),
    );
    if (error) {
      toast.error(error.includes("seo_title") ? "Run the SEO SQL migration to store custom titles." : error);
      return;
    }
    toast.success("SEO copy saved.");
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Public profiles" value={String(publicCount)} />
        <Kpi label="Index candidates" value={String(eligible)} />
        <Kpi label="Missing description" value={String(missingDesc)} />
        <Kpi label="Missing image" value={String(missingImage)} />
        <Kpi label="Missing location" value={String(missingLocation)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Readiness is content completeness (0–100), not a Google ranking promise. Sitemap: https://www.tijar.ng/sitemap.xml
        (cached 1 hour). Duplicate slugs: {duplicateSlugs.length}.
      </p>

      <section className="rounded-2xl border border-border p-4">
        <h3 className="text-sm font-extrabold">Hausa and English keywords</h3>
        <ul className="mt-2 grid gap-1 text-sm">
          {SEO_KEYWORD_SEED.map((row) => (
            <li key={row.slug} className="flex flex-wrap justify-between gap-2">
              <span>
                <span className="font-bold">{row.hausaLabel}</span> = {row.englishLabel}
              </span>
              <span className="text-muted-foreground">{row.categoryName}</span>
            </li>
          ))}
          {(aliasesQuery.data ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap justify-between gap-2">
              <span>
                <span className="font-bold">{row.keyword}</span> = {row.english_label}
              </span>
              <span className="text-muted-foreground">{row.category_slug}</span>
            </li>
          ))}
        </ul>
        <form className="mt-3 grid gap-2 sm:grid-cols-4" onSubmit={onAddKeyword}>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Alias (e.g. dan wake)" />
          <Input value={englishLabel} onChange={(e) => setEnglishLabel(e.target.value)} placeholder="English label" />
          <Input value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} placeholder="category slug" />
          <Button type="submit" className="rounded-xl font-bold">
            Add alias
          </Button>
        </form>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Shop</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Index</th>
              <th className="px-3 py-2">Missing</th>
              <th className="px-3 py-2">SEO title / description</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map(({ biz, readiness }) => (
              <tr key={biz.id} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <p className="font-extrabold">{biz.business_name}</p>
                  <p className="text-xs text-muted-foreground">{biz.public_slug ? `/b/${biz.public_slug}` : "no slug"}</p>
                </td>
                <td className="px-3 py-2 font-extrabold tabular-nums">{readiness.score}</td>
                <td className="px-3 py-2">{readiness.indexable ? "candidate" : "noindex"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{readiness.missing.join(", ") || "—"}</td>
                <td className="px-3 py-2">
                  <form
                    className="grid gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onSaveSeo(biz.id, e.currentTarget);
                    }}
                  >
                    <Input name="seo_title" defaultValue={(biz as AdminBusiness & { seo_title?: string }).seo_title ?? ""} placeholder="Custom title" />
                    <Input
                      name="seo_description"
                      defaultValue={(biz as AdminBusiness & { seo_description?: string }).seo_description ?? ""}
                      placeholder="Custom description"
                    />
                    <Button type="submit" size="sm" variant="outline" className="w-fit rounded-lg">
                      Save
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
