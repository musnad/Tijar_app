import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";

import { VideoFeedScreen } from "@/features/marketplace/video-feed-screen";
import { marketingSeo } from "@/lib/seo/catalog";

type ShopSearch = { v?: string };

function ShopLoadError({ reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6">
      <p className="mb-8 text-center text-[22px] font-extrabold tracking-[0.18em] text-[#001B3A]">TIJAR</p>
      <p className="text-center text-sm font-semibold text-[#5a6578]">The feed did not open. Check your connection and try again.</p>
      <button
        type="button"
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-extrabold text-white"
        onClick={() => {
          reset();
          window.location.replace("https://www.tijar.ng/shop");
        }}
      >
        Try again
      </button>
    </div>
  );
}

export const Route = createFileRoute("/shop/")({
  head: () =>
    marketingSeo(
      "Shop on TIJAR — Buy from local Nigerian sellers",
      "Watch shops, follow sellers, and buy products across Nigeria on TIJAR. Search anything and order on tijar.ng.",
      "/shop",
      "buy Nigeria, Nigerian marketplace, TIJAR shop, tijar.ng",
    ),
  validateSearch: (search: Record<string, unknown>): ShopSearch => {
    if (typeof search.v === "string" && search.v.length > 0) return { v: search.v };
    return {};
  },
  component: ForYouPage,
  errorComponent: ShopLoadError,
});

function ForYouPage() {
  const { v } = Route.useSearch();
  return <VideoFeedScreen initialVideoId={v} />;
}
