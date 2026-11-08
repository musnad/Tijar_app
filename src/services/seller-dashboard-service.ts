import { listingCompleteness } from "@/utils/discover";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Business, BusinessEnquiry, MarketplaceOrder, Product } from "@/types/database";
import { listProducts } from "@/services/product-service";
import { fetchBusinessEnquiries } from "@/services/discover-service";

export type SellerVideoRow = {
  id: string;
  caption: string | null;
  status: string;
  moderation_status: string;
  published_at: string | null;
  like_count: number;
  view_count: number;
  save_count: number;
  processing_error: string | null;
  rejection_reason: string | null;
  cover_path: string | null;
  storage_path?: string | null;
  created_at: string;
};

export type ContentAnalytics = {
  impressions: number;
  qualified_views: number;
  completes: number;
  likes: number;
  saves: number;
  shares: number;
  product_clicks: number;
  enquiries: number;
  order_requests: number;
  confirmed_orders: number;
  attributed_orders: number;
  video_counts: {
    draft: number;
    processing: number;
    pending_moderation: number;
    published: number;
    rejected: number;
    failed: number;
  };
};

const EMPTY_ANALYTICS: ContentAnalytics = {
  impressions: 0,
  qualified_views: 0,
  completes: 0,
  likes: 0,
  saves: 0,
  shares: 0,
  product_clicks: 0,
  enquiries: 0,
  order_requests: 0,
  confirmed_orders: 0,
  attributed_orders: 0,
  video_counts: {
    draft: 0,
    processing: 0,
    pending_moderation: 0,
    published: 0,
    rejected: 0,
    failed: 0,
  },
};

export async function fetchSellerVideos(businessId: string): Promise<{
  videos: SellerVideoRow[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const full =
    "id, caption, status, moderation_status, published_at, like_count, view_count, save_count, processing_error, rejection_reason, cover_path, storage_path, created_at";
  const core =
    "id, caption, status, moderation_status, published_at, like_count, view_count, save_count, cover_path, storage_path, created_at";
  let { data, error } = await supabase
    .from("video_posts")
    .select(full)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) {
    const retry = await supabase
      .from("video_posts")
      .select(core)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (retry.error) return { videos: [], error: retry.error.message };
    data = retry.data;
  }
  return { videos: (data ?? []) as SellerVideoRow[], error: null };
}

export async function fetchContentAnalytics(businessId: string): Promise<{
  analytics: ContentAnalytics;
  error: string | null;
  fromRpc: boolean;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("business_content_analytics", { p_business_id: businessId });
  if (!error && data) {
    return { analytics: { ...EMPTY_ANALYTICS, ...(data as ContentAnalytics) }, error: null, fromRpc: true };
  }
  return { analytics: EMPTY_ANALYTICS, error: null, fromRpc: false };
}

export async function fetchSellerOrders(businessId: string): Promise<{
  orders: MarketplaceOrder[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return { orders: [], error: error.message };
  return { orders: (data ?? []) as MarketplaceOrder[], error: null };
}

export function sellerOverview(input: {
  business: Business;
  products: Product[];
  videos: SellerVideoRow[];
}): {
  completeness: ReturnType<typeof listingCompleteness>;
  publishedProducts: number;
  draftProducts: number;
  archivedProducts: number;
} {
  const active = input.products.filter((p) => p.is_active !== false);
  return {
    completeness: listingCompleteness({
      business_name: input.business.business_name,
      description: input.business.description,
      public_slug: input.business.public_slug,
      latitude: input.business.latitude,
      longitude: input.business.longitude,
      location_approved: input.business.location_approved,
      public_phone: input.business.public_phone,
      public_whatsapp: input.business.public_whatsapp,
      logo_url: input.business.logo_url,
      productCount: active.length,
    }),
    publishedProducts: active.filter((p) => p.is_published !== false).length,
    draftProducts: active.filter((p) => p.is_published === false).length,
    archivedProducts: input.products.filter((p) => p.is_active === false).length,
  };
}

export async function loadSellerDashboard(businessId: string, business: Business): Promise<{
  products: Product[];
  videos: SellerVideoRow[];
  analytics: ContentAnalytics;
  analyticsReady: boolean;
  orders: MarketplaceOrder[];
  enquiries: BusinessEnquiry[];
  overview: ReturnType<typeof sellerOverview>;
  error: string | null;
}> {
  const [products, videos, analytics, orders, enquiries] = await Promise.all([
    listProducts(businessId, { includeArchived: true }),
    fetchSellerVideos(businessId),
    fetchContentAnalytics(businessId),
    fetchSellerOrders(businessId),
    fetchBusinessEnquiries(businessId),
  ]);
  const error = products.error || videos.error || orders.error || enquiries.error;
  return {
    products: products.data,
    videos: videos.videos,
    analytics: analytics.analytics,
    analyticsReady: analytics.fromRpc,
    orders: orders.orders,
    enquiries: enquiries.data,
    overview: sellerOverview({ business, products: products.data, videos: videos.videos }),
    error,
  };
}
