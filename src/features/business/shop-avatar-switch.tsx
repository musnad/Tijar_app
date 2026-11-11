"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil, Store } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-context";
import { writeActiveShopId } from "@/lib/active-business";
import { haptic } from "@/lib/haptics";
import { fetchOwnedBusinesses } from "@/services/business-service";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";

export function ShopAvatarSwitch({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: primary } = usePrimaryBusiness(profile?.id);
  const [open, setOpen] = useState(false);
  const lastTap = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);

  const shopsQuery = useQuery({
    queryKey: ["owned-businesses", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchOwnedBusinesses(profile!.id)).businesses,
  });
  const shops = (shopsQuery.data ?? []).filter((s) => !(s as { deleted_at?: string | null }).deleted_at);
  const current = primary?.business;

  async function switchTo(id: string) {
    if (!profile || id === current?.id) {
      setOpen(false);
      return;
    }
    writeActiveShopId(profile.id, id);
    await queryClient.invalidateQueries({ queryKey: ["primary-business", profile.id] });
    const shop = shops.find((row) => row.id === id);
    haptic("success");
    toast.success(`Now using ${shop?.business_name ?? "this shop"}`);
    setOpen(false);
  }

  async function cycle() {
    if (shops.length < 2 || !current) {
      setOpen(true);
      return;
    }
    const idx = shops.findIndex((s) => s.id === current.id);
    const next = shops[(idx + 1) % shops.length];
    if (next) await switchTo(next.id);
  }

  function clearHold() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  return (
    <>
      <div
        className={className}
        role="button"
        tabIndex={0}
        aria-label="Switch shop"
        onPointerDown={() => {
          held.current = false;
          clearHold();
          holdTimer.current = window.setTimeout(() => {
            held.current = true;
            haptic();
            setOpen(true);
          }, 480);
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          if (held.current) {
            e.preventDefault();
            held.current = false;
            return;
          }
          const now = Date.now();
          if (now - lastTap.current < 320) {
            lastTap.current = 0;
            void cycle();
            return;
          }
          lastTap.current = now;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Your shops</SheetTitle>
          </SheetHeader>
          <ul className="mt-3 space-y-2 pb-6">
            {shops.map((shop) => (
              <li key={shop.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void switchTo(shop.id)}>
                  <p className="truncate font-extrabold text-[#0B1F4D]">{shop.business_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {shop.id === current?.id ? "In use" : shop.parent_business_id ? "Branch" : "Shop"}
                  </p>
                </button>
                <Button size="sm" variant="outline" className="rounded-full" asChild>
                  <Link to="/app/business">
                    <Pencil className="size-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
          <Button className="min-h-11 w-full rounded-full font-bold" asChild>
            <Link to="/shop/branches">
              <Store className="mr-2 size-4" /> Add or edit shops
            </Link>
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

