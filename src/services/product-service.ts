import type { ProductFormInput, StockAdjustInput } from "@/features/products/schemas";
import { parseAttributes, variantsFromSizeColour } from "@/lib/catalogue/variants";
import { requireVerifiedShop } from "@/lib/kyc/require-shop-verified";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureOwnerMembership } from "@/services/business-service";
import type { Product, ProductKind, StockMovementReason } from "@/types/database";

export async function listProducts(
  businessId: string,
  options?: { includeArchived?: boolean },
): Promise<{
  data: Product[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase.from("products").select("*").eq("business_id", businessId).order("name");
  if (!options?.includeArchived) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Product[], error: null };
}

export async function getProduct(productId: string): Promise<{
  product: Product | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("products").select("*").eq("id", productId).maybeSingle();
  if (error) return { product: null, error: error.message };
  return { product: (data as Product) ?? null, error: null };
}

export async function updateProductImageUrl(
  productId: string,
  imageUrl: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("products").update({ image_url: imageUrl }).eq("id", productId);
  return { error: error?.message ?? null };
}

export async function updateProductImages(
  productId: string,
  urls: string[],
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const image_url = urls[0] ?? null;
  const extra_image_urls = urls.slice(1);
  const withExtra = await supabase
    .from("products")
    .update({ image_url, extra_image_urls })
    .eq("id", productId);
  if (!withExtra.error) return { error: null };
  const fallback = await supabase.from("products").update({ image_url }).eq("id", productId);
  return { error: fallback.error?.message ?? withExtra.error.message };
}

function mapProductError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security") || m.includes("rls") || m.includes("permission")) {
    return "You do not have permission to add products for this business. Sign in again.";
  }
  if (m.includes("products_name_not_empty") || (m.includes("null value") && m.includes("name"))) {
    return "Enter a product name.";
  }
  if (m.includes("insufficient stock")) {
    return "Stock change is not allowed (would go below zero).";
  }
  if (m.includes("column") && m.includes("kind")) {
    return "Database needs the products update. Ask your admin to run the latest Supabase migrations.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Network error — check your connection and try again.";
  }
  return message;
}

type ProductInsert = {
  business_id: string;
  name: string;
  kind?: ProductKind;
  unit: string;
  sale_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  notes: string | null;
  description?: string | null;
  attributes?: Record<string, string>;
  variants?: unknown;
  video_url?: string | null;
  catalogue_category?: string | null;
  is_published?: boolean;
  currency?: string;
  service_type?: string;
  starts_on?: string | null;
  ends_on?: string | null;
};

export async function createProduct(
  businessId: string,
  profileId: string,
  input: ProductFormInput,
): Promise<{ product: Product | null; error: string | null }> {
  const blocked = await requireVerifiedShop(businessId);
  if (blocked) return { product: null, error: blocked };
  const supabase = getSupabaseBrowserClient();
  const kind = (input.kind ?? "goods") as ProductKind;
  const name = input.name.trim();
  if (name.length < 1) return { product: null, error: "Enter a product name." };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.data.session) {
      return {
        product: null,
        error: "Your session expired. Sign in again, then add the product.",
      };
    }
  }

  // Heal missing owner membership — otherwise products RLS blocks the insert.
  await ensureOwnerMembership(businessId, profileId);

  const fullPayload: ProductInsert = {
    business_id: businessId,
    name,
    kind,
    unit: kind === "service" ? "job" : input.unit?.trim() || "piece",
    sale_price: input.salePrice ?? null,
    cost_price: input.costPrice ?? null,
    stock_quantity: kind === "service" ? 0 : input.initialStock && input.initialStock > 0 ? 0 : 1,
    low_stock_threshold: kind === "service" ? 0 : (input.lowStockThreshold ?? 5),
    notes: input.notes?.trim() || input.description?.trim() || null,
    description: input.description?.trim() || input.notes?.trim() || null,
    attributes: parseAttributes(input.size, input.colour),
    variants: variantsFromSizeColour(input.sizes ?? "", input.colours ?? ""),
    video_url: input.videoUrl?.trim() || null,
    catalogue_category: input.catalogueCategory?.trim() || null,
    is_published: false,
    currency: "NGN",
    service_type: kind === "service" ? (input.serviceType ?? "general") : "general",
    starts_on: kind === "service" && input.startsOn ? input.startsOn : null,
    ends_on: kind === "service" && input.endsOn ? input.endsOn : null,
  };

  let data: unknown = null;
  let error: { message: string } | null = null;

  const first = await supabase.from("products").insert(fullPayload).select("*").single();
  data = first.data;
  error = first.error;

  if (error && /service_type|starts_on|ends_on/i.test(error.message)) {
    const { service_type: _st, starts_on: _so, ends_on: _eo, ...withoutService } = fullPayload;
    const retry = await supabase.from("products").insert(withoutService).select("*").single();
    data = retry.data;
    error = retry.error;
  }

  // Older DBs without `kind` — retry without that column so add still works.
  if (error && /kind|product_kind/i.test(error.message)) {
    const { kind: _kind, ...withoutKind } = fullPayload;
    const retry = await supabase.from("products").insert(withoutKind).select("*").single();
    data = retry.data;
    error = retry.error;
  }

  // Last resort: minimal row (name + unit) so the shopkeeper still gets a product.
  if (error) {
    const minimal = {
      business_id: businessId,
      name,
      unit: kind === "service" ? "job" : input.unit?.trim() || "piece",
      stock_quantity: 0,
      low_stock_threshold: kind === "service" ? 0 : (input.lowStockThreshold ?? 5),
    };
    const retry = await supabase.from("products").insert(minimal).select("*").single();
    if (!retry.error && retry.data) {
      data = retry.data;
      error = null;
      // Best-effort price update if the insert worked without prices.
      if (input.salePrice != null || input.costPrice != null || input.notes) {
        await supabase
          .from("products")
          .update({
            sale_price: input.salePrice ?? null,
            cost_price: input.costPrice ?? null,
            notes: input.notes?.trim() || null,
          })
          .eq("id", (retry.data as Product).id);
      }
    } else {
      error = retry.error ?? error;
    }
  }

  if (error) return { product: null, error: mapProductError(error.message) };
  const product = data as Product;

  if (fullPayload.is_published && fullPayload.sale_price != null) {
    await supabase.rpc("ensure_marketplace_listing", { p_business_id: businessId });
  }

  if (kind === "goods" && input.initialStock && input.initialStock > 0) {
    const moveErr = await recordStockMovement(
      businessId,
      profileId,
      product.id,
      input.initialStock,
      "initial",
      "Opening stock",
    );
    if (!moveErr) {
      const refreshed = await getProduct(product.id);
      return { product: refreshed.product ?? product, error: null };
    }

    // Fallback: set stock directly so the product still shows the right count.
    const { error: stockErr } = await supabase
      .from("products")
      .update({ stock_quantity: input.initialStock })
      .eq("id", product.id);
    if (!stockErr) {
      const refreshed = await getProduct(product.id);
      return { product: refreshed.product ?? product, error: null };
    }

    // Product row exists — never fail the whole add because of stock.
    return {
      product,
      error: `Product saved, but opening stock failed: ${mapProductError(moveErr)}`,
    };
  }

  return { product, error: null };
}

export async function recordStockMovement(
  businessId: string,
  profileId: string,
  productId: string,
  quantityDelta: number,
  reason: StockMovementReason,
  notes?: string,
  transactionId?: string,
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("stock_movements").insert({
    business_id: businessId,
    product_id: productId,
    quantity_delta: quantityDelta,
    reason,
    notes: notes?.trim() || null,
    created_by: profileId,
    transaction_id: transactionId ?? null,
  });
  return error?.message ?? null;
}

export async function adjustStock(
  businessId: string,
  profileId: string,
  productId: string,
  input: StockAdjustInput,
): Promise<{ error: string | null }> {
  const delta = input.direction === "in" ? input.quantity : -input.quantity;
  const err = await recordStockMovement(
    businessId,
    profileId,
    productId,
    delta,
    input.reason,
    input.notes,
  );
  return { error: err };
}

export async function deactivateProduct(productId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("products").update({ is_active: false, is_published: false }).eq("id", productId);
  return { error: error?.message ?? null };
}

export async function restoreProduct(productId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("products").update({ is_active: true }).eq("id", productId);
  return { error: error?.message ?? null };
}

export async function setProductPublished(
  productId: string,
  published: boolean,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  if (published) {
    const { data } = await supabase.from("products").select("image_url").eq("id", productId).maybeSingle();
    if (!String(data?.image_url ?? "").trim()) {
      return { error: "Add at least one photo. You cannot post without an image." };
    }
  }
  const { error } = await supabase.from("products").update({ is_published: published }).eq("id", productId);
  return { error: error?.message ?? null };
}

export async function updateProduct(
  productId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    notes: string | null;
    sale_price: number | null;
    unit: string;
    variants: unknown;
    attributes: Record<string, string>;
    image_url: string | null;
    extra_image_urls: string[];
    is_published: boolean | null;
    video_url: string | null;
    service_type: string;
    starts_on: string | null;
    ends_on: string | null;
  }>,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("products").update(patch).eq("id", productId);
  return { error: error?.message ?? null };
}
