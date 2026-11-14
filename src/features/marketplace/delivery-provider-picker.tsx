"use client";

import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { fetchDeliveryProviders, type DeliveryProvider } from "@/services/delivery-providers";
import { formatNgn } from "@/utils/money";

export function DeliveryProviderPicker({
  selectedId,
  onSelect,
}: {
  includeShopId?: string | null;
  selectedId: string | null;
  onSelect: (provider: DeliveryProvider) => void;
}) {
  const query = useQuery({
    queryKey: ["delivery-providers"],
    queryFn: async () => {
      const r = await fetchDeliveryProviders();
      if (r.error) throw new Error(r.error);
      return r.providers;
    },
  });
  const providers = query.data ?? [];

  if (query.isLoading) {
    return <p className="mt-2 text-[13px] text-muted-foreground">Loading delivery businesses…</p>;
  }
  if (providers.length === 0) {
    return (
      <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
        No delivery companies yet. Shops named Delivery, Dispatch, Rider, Logistics, or related appear here when you choose delivery.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm font-extrabold text-[#0B1F4D]">Choose a delivery company</p>
      <p className="text-[12px] text-muted-foreground">
        Shops whose name or trade is delivery, dispatch, rider, or logistics. Pickup does not use this list.
      </p>
      <ul className="space-y-2">
        {providers.map((provider) => {
          const active = selectedId === provider.offerId;
          return (
            <li key={provider.offerId}>
              <button
                type="button"
                onClick={() => onSelect(provider)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left",
                  active ? "border-[#1F7A4D] bg-[#F4FBF7]" : "border-border bg-white",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#0B1F4D] text-sm font-extrabold text-white">
                  {provider.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={provider.logoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    provider.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-[#0B1F4D]">{provider.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {provider.offerTitle}
                    {provider.source === "shop" ? " · Delivery company" : provider.source === "place_order" ? " · Place order" : " · Product"}
                    {provider.location ? ` · ${provider.location}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-[#1F7A4D]">
                  {provider.fee > 0 ? formatNgn(provider.fee) : "Ask fee"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
