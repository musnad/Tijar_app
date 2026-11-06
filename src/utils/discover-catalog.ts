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
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

export function filterCatalogProducts<T extends CatalogProduct>(
  products: T[],
  filters: CatalogFilters,
): T[] {
  return products.filter((p) => {
    if (filters.kind && filters.kind !== "all" && p.kind !== filters.kind) return false;
    if (filters.availableOnly && !p.is_available) return false;
    if (filters.category && (p.category_name ?? "") !== filters.category) return false;
    if (filters.minPrice != null && (p.sale_price == null || p.sale_price < filters.minPrice)) return false;
    if (filters.maxPrice != null && (p.sale_price == null || p.sale_price > filters.maxPrice)) return false;
    if (filters.attribute) {
      const attrs = Object.values(p.attributes ?? {}).join(" ").toLowerCase();
      if (!attrs.includes(filters.attribute.trim().toLowerCase())) return false;
    }
    if (!matchesWords(haystack([p.name, p.description, p.business_name, p.category_name]), filters.query ?? "")) {
      return false;
    }
    return true;
  });
}

export function filterCatalogSellers<T extends CatalogSeller>(sellers: T[], query: string, categoryId?: string | null): T[] {
  return sellers.filter((s) => {
    if (categoryId && s.category_id !== categoryId) return false;
    return matchesWords(
      haystack([
        s.business_name,
        s.description,
        s.category_name,
        s.location_text,
        s.public_location_label,
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
  const q = input.query.trim().toLowerCase();
  if (q.length < 1) return [];
  const limit = input.limit ?? 8;
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();

  function push(item: SearchSuggestion) {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  }

  for (const c of input.categories) {
    if (c.toLowerCase().includes(q)) push({ label: c, kind: "category" });
  }
  for (const s of input.sellers) {
    const loc = `${s.public_location_label ?? ""} ${s.location_text ?? ""}`.toLowerCase();
    if (s.business_name.toLowerCase().includes(q) || loc.includes(q) || (s.category_name ?? "").toLowerCase().includes(q)) {
      push({ label: s.business_name, kind: "seller" });
    }
  }
  for (const p of input.products) {
    if (!p.name.toLowerCase().includes(q)) continue;
    push({ label: p.name, kind: p.kind === "service" ? "service" : "product" });
  }
  return out.slice(0, limit);
}
