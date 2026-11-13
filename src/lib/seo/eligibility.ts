import { parseNigerianLocation } from "@/lib/nigeria-locations";
import type { PublicBusiness, PublicProduct } from "@/types/database";

const SUSPENDED = new Set(["flagged", "suspended", "rejected", "draft"]);

export function shopPlaceLine(shop: Pick<PublicBusiness, "public_location_label" | "location_text">): string {
  return (shop.public_location_label || shop.location_text || "").trim();
}

export function shopHasUsefulSeoContent(shop: PublicBusiness, products: PublicProduct[] = []): boolean {
  const name = shop.business_name?.trim() ?? "";
  if (!name || name.length < 2) return false;
  const desc = shop.description?.replace(/\s+/g, " ").trim() ?? "";
  const hasDesc = desc.length >= 20;
  const hasPhoto = Boolean(shop.logo_url?.trim() || shop.cover_image_url?.trim());
  const hasPlace = Boolean(shopPlaceLine(shop));
  const hasProducts = products.some((p) => p.name?.trim());
  const hasCategory = Boolean(shop.category_name?.trim());
  return hasDesc || hasPhoto || hasProducts || (hasPlace && hasCategory);
}

export function isPublicShopIndexable(shop: PublicBusiness | null | undefined, products: PublicProduct[] = []): boolean {
  if (!shop?.slug?.trim()) return false;
  if (!shop.business_name?.trim()) return false;
  const status = (shop.verification_status ?? "").toLowerCase();
  if (SUSPENDED.has(status)) return false;
  return shopHasUsefulSeoContent(shop, products);
}

export function seoReadinessScore(input: {
  isPublished?: boolean | null;
  slug?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  location?: string | null;
  publicLocation?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  publicPhone?: string | null;
  publicWhatsapp?: string | null;
  productCount?: number;
  moderationStatus?: string | null;
}): { score: number; missing: string[]; indexable: boolean } {
  const missing: string[] = [];
  let score = 0;
  const published = Boolean(input.isPublished);
  const slug = Boolean(input.slug?.trim());
  const moderation = (input.moderationStatus ?? "approved").toLowerCase();
  const blocked = moderation === "flagged" || moderation === "suspended";
  if (published && slug && !blocked) score += 20;
  else {
    if (!published) missing.push("published");
    if (!slug) missing.push("slug");
    if (blocked) missing.push("moderation");
  }
  if ((input.description ?? "").trim().length >= 40) score += 20;
  else missing.push("description");
  if (input.logoUrl?.trim() || input.coverUrl?.trim()) score += 15;
  else missing.push("image");
  if (input.publicLocation?.trim() || input.location?.trim()) score += 15;
  else missing.push("location");
  if (input.categoryId || input.categoryName?.trim()) score += 10;
  else missing.push("category");
  if (input.publicPhone?.trim() || input.publicWhatsapp?.trim()) score += 10;
  else missing.push("contact");
  if ((input.productCount ?? 0) > 0) score += 10;
  else missing.push("products");
  return {
    score,
    missing,
    indexable: published && slug && !blocked && score >= 50,
  };
}

export function parsedShopPlace(shop: Pick<PublicBusiness, "public_location_label" | "location_text">): {
  state: string;
  lga: string;
  label: string;
} {
  const label = shopPlaceLine(shop);
  const parsed = parseNigerianLocation(label);
  return { state: parsed.state, lga: parsed.lga, label };
}
