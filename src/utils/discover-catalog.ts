/** Catalogue search, suggestions, and filters — no I/O so tests stay pure. */

export type CatalogKind = "goods" | "service";

export type CatalogProduct = {
  id: string;
  name: string;
  kind: CatalogKind;
  description?: string | null;
  sale_price: number | null;
  is_available: boolean;
  category_name?: string | null;
  business_id: string;
  business_name?: string | null;
  business_slug?: string | null;
  attributes?: Record<string, string> | null;
};

export type CatalogSeller = {
  id: string;
  slug: string;
  business_name: string;
  description?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  product_names?: string[];
  location_text?: string | null;
  public_location_label?: string | null;
};

/** Informal trade words people type even when the shop never picked a category. */
const SEARCH_ALIAS_GROUPS = [
  ["suya", "tsire", "tsiire", "kilishi", "balangu"],
  ["masa", "waina"],
  ["kosai", "akara"],
  ["fura", "nono"],
];

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/^@+/, "").toLowerCase();
}

export function expandSearchTerms(query: string): string[] {
  const words = normalizeSearchQuery(query).split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (const word of words) {
    out.add(word);
    for (const group of SEARCH_ALIAS_GROUPS) {
      if (group.some((alias) => alias === word || alias.startsWith(word) || word.startsWith(alias))) {
        for (const alias of group) out.add(alias);
      }
    }
  }
  return [...out];
}

function handleTokens(slug?: string | null): string[] {
  const raw = (slug ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!raw) return [];
  return [raw, raw.replace(/-/g, ""), `@${raw}`];
}

export type CatalogFilters = {
  query?: string;
  kind?: CatalogKind | "all";
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  availableOnly?: boolean;
  attribute?: string | null;
};

export type SearchSuggestion = {
  label: string;
  kind: "product" | "service" | "seller" | "category";
};

function haystack(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function matchesWords(text: string, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  return q.split(/\s+/).filter(Boolean).every((word) => {
    const terms = expandSearchTerms(word);
    return terms.some((term) => text.includes(term));
  });
}

export function filterCatalogProducts<T extends CatalogProduct>(
  products: T[],
  filters: CatalogFilters,
): T[] {
  return products.filter((p) => {
    if (filters.kind && filters.kind !== "all" && p.kind !== filters.kind) return false;
    if (filters.availableOnly && !p.is_available) return false;
    const q = (filters.query ?? "").trim();
    if (!q && filters.category && (p.category_name ?? "") !== filters.category) return false;
    if (filters.minPrice != null && (p.sale_price == null || p.sale_price < filters.minPrice)) return false;
    if (filters.maxPrice != null && (p.sale_price == null || p.sale_price > filters.maxPrice)) return false;
    if (filters.attribute) {
      const attrs = Object.values(p.attributes ?? {}).join(" ").toLowerCase();
      if (!attrs.includes(filters.attribute.trim().toLowerCase())) return false;
    }
    if (
      !matchesWords(
        haystack([p.name, p.description, p.business_name, p.business_slug, p.category_name, ...handleTokens(p.business_slug)]),
        filters.query ?? "",
      )
    ) {
      return false;
    }
    return true;
  });
}

export function filterCatalogSellers<T extends CatalogSeller>(sellers: T[], query: string, categoryId?: string | null): T[] {
  const q = query.trim();
  return sellers.filter((s) => {
    if (!q && categoryId && s.category_id !== categoryId) return false;
    return matchesWords(
      haystack([
        s.business_name,
        s.slug,
        s.description,
        s.category_name,
        s.location_text,
        s.public_location_label,
        ...handleTokens(s.slug),
        ...(s.product_names ?? []),
      ]),
      query,
    );
  });
}

export function catalogSuggestions(input: {
  query: string;
  products: CatalogProduct[];
  sellers: CatalogSeller[];
  categories: string[];
  limit?: number;
}): SearchSuggestion[] {
  const q = normalizeSearchQuery(input.query);
  if (q.length < 1) return [];
  const terms = expandSearchTerms(q);
  const limit = input.limit ?? 8;
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();

  function push(item: SearchSuggestion) {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  }

  function hits(text: string) {
    const hay = text.toLowerCase();
    return terms.some((term) => hay.includes(term));
  }

  for (const c of input.categories) {
    if (hits(c)) push({ label: c, kind: "category" });
  }
  for (const s of input.sellers) {
    const loc = `${s.public_location_label ?? ""} ${s.location_text ?? ""}`;
    if (hits(`${s.business_name} ${s.slug} ${loc} ${s.category_name ?? ""} ${s.description ?? ""} ${(s.product_names ?? []).join(" ")}`)) {
      push({ label: s.business_name, kind: "seller" });
      if (s.slug && !s.business_name.toLowerCase().includes(s.slug.toLowerCase())) {
        push({ label: `@${s.slug.replace(/^@/, "")}`, kind: "seller" });
      }
    }
  }
  for (const p of input.products) {
    if (!p.name.toLowerCase().includes(q)) continue;
    push({ label: p.name, kind: p.kind === "service" ? "service" : "product" });
  }
  return out.slice(0, limit);
}
