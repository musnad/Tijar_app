"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock3, MapPin, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MediaCarousel } from "@/components/media/media-carousel";
import { Button } from "@/components/ui/button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { PlaceOrderFormSheet } from "@/features/marketplace/place-order-form-sheet";
import { PlaceOrderSocialBar } from "@/features/marketplace/place-order-social";
import {
  categoryLabel,
  dayLabel,
  fetchPlaceOrderListing,
  placeOrderSoldOut,
  sharePlaceOrderPost,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

export function PlaceOrderDetailScreen({
  listingId,
  openForm = false,
}: {
  listingId: string;
  openForm?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(openForm);

  useEffect(() => {
    if (openForm) setFormOpen(true);
  }, [openForm]);

  const listingQuery = useQuery({
    queryKey: ["place-order-listing", listingId],
    queryFn: async () => (await fetchPlaceOrderListing(listingId)).listing,
  });
  const listing = listingQuery.data;
  const soldOut = listing ? placeOrderSoldOut(listing) : false;

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="flex items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" className="flex size-10 items-center justify-center" onClick={() => history.back()} aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-[#0B1F4D]">Place your order</h1>
          {listing ? (
            <button
              type="button"
              className="flex size-10 items-center justify-center"
              aria-label="Share"
              onClick={async () => {
                const result = await sharePlaceOrderPost(listing);
                if (result.shared) {
                  void queryClient.invalidateQueries({ queryKey: ["place-order-listing", listing.id] });
                  if (!navigator.share) toast.success("Link copied");
                }
              }}
            >
              <Share2 className="size-5" />
            </button>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28" style={{ WebkitOverflowScrolling: "touch" }}>
          {listingQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!listingQuery.isLoading && !listing ? (
            <p className="text-sm text-destructive">This post is no longer open.</p>
          ) : null}
          {listing ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="aspect-[4/5] bg-muted">
                  <MediaCarousel urls={listing.image_urls} eager />
                </div>
              </div>
              <div className="-mx-2 mt-1">
                <PlaceOrderSocialBar listing={listing} />
              </div>
              <h2 className="mt-3 text-[22px] font-extrabold text-[#0B1F4D]">{listing.title}</h2>
              <p className="text-sm font-semibold text-[#1F7A4D]">{listing.shop_name}</p>
              <p className="mt-1 text-lg font-extrabold text-[#1F7A4D]">{formatNgn(listing.price)}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-foreground">{listing.details || "Tap Place your order to fill a short form."}</p>
              <p className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold text-muted-foreground">
                <span>{categoryLabel(listing.category)}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3.5" />
                  {dayLabel(listing.available_on)}
                </span>
                {listing.location_label ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {listing.location_label}
                  </span>
                ) : null}
              </p>
            </>
          ) : null}
        </div>
        {listing ? (
          <div className="shrink-0 border-t border-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              className="min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
              disabled={soldOut}
              onClick={() => setFormOpen(true)}
            >
              {soldOut ? "Sold out" : "Place your order"}
            </Button>
          </div>
        ) : null}
        {listing ? (
          <PlaceOrderFormSheet
            listing={listing}
            open={formOpen}
            onOpenChange={(next) => {
              setFormOpen(next);
              if (!next) {
                void navigate({
                  to: "/shop/order-now/$listingId",
                  params: { listingId },
                  search: { form: undefined },
                  replace: true,
                });
              }
            }}
          />
        ) : null}
      </div>
    </MarketplaceShell>
  );
}
