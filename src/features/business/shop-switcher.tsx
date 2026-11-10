"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, GitBranch } from "lucide-react";
import { toast } from "sonner";

import { writeActiveShopId } from "@/lib/active-business";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-context";
import { fetchOwnedBusinesses } from "@/services/business-service";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";

export function ShopSwitcher({ className }: { className?: string }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: primary } = usePrimaryBusiness(profile?.id);
  const shopsQuery = useQuery({
    queryKey: ["owned-businesses", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const result = await fetchOwnedBusinesses(profile!.id);
      return result.businesses;
    },
  });
  const shops = shopsQuery.data ?? [];
  const current = primary?.business;
  if (!profile || shops.length < 2) {
    if (!profile || !current) return null;
    return (
      <Link
        to="/shop/branches"
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#1F7A4D]/25 bg-[#F4FBF7] px-3 py-1.5 text-[11px] font-extrabold text-[#1F7A4D]",
          className,
        )}
      >
        <GitBranch className="size-3.5" />
        Add a branch shop
      </Link>
    );
  }

  async function switchTo(id: string) {
    if (!profile || id === current?.id) return;
    writeActiveShopId(profile.id, id);
    await queryClient.invalidateQueries({ queryKey: ["primary-business", profile.id] });
    const shop = shops.find((row) => row.id === id);
    toast.success(`Now viewing ${shop?.business_name ?? "this shop"}`);
    void navigate({ to: "/app" });
  }

  return (
    <div className={cn("mt-3 flex flex-wrap items-center gap-2", className)}>
      <label className="relative inline-flex min-w-0 max-w-full items-center">
        <select
          className="h-9 max-w-[16rem] appearance-none rounded-full border border-[#1F7A4D]/30 bg-white py-1 pl-3 pr-8 text-xs font-extrabold text-[#0B1F4D]"
          value={current?.id ?? ""}
          onChange={(e) => void switchTo(e.target.value)}
        >
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.business_name}
              {shop.parent_business_id ? " · branch" : " · HQ"}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
      </label>
      <Link
        to="/shop/branches"
        className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#1F7A4D]"
      >
        <GitBranch className="size-3.5" />
        Branches
      </Link>
    </div>
  );
}
