"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Home, Lock, ShieldCheck, ShoppingBag, ShoppingCart, Store, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TijarLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { haptic } from "@/lib/haptics";
import { listLocalCart } from "@/lib/local-cart";
import { cn } from "@/lib/utils";
import { fetchCart, removeCartItem, updateCartItemQuantity } from "@/services/marketplace-service";
import type { CartItem } from "@/types/database";
import { formatPricePerUnit, formatUnitWord, unitStep } from "@/lib/catalogue/units";
import { formatNgn } from "@/utils/money";

function itemCountLabel(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

export function CartScreen() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const actorId = profile?.id ?? "guest";
  const [leaving, setLeaving] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<CartItem[]>([]);

  const cartQuery = useQuery({
    queryKey: ["marketplace-cart-v2", actorId],
    queryFn: async () => {
      const res = await fetchCart(actorId);
      if (res.error && res.items.length === 0) throw new Error(res.error);
      return res.items;
    },
  });

  useEffect(() => {
    setLocalItems(listLocalCart(actorId));
  }, [actorId, cartQuery.dataUpdatedAt]);

  const items = (cartQuery.data && cartQuery.data.length > 0 ? cartQuery.data : localItems);
  const pieceCount = items.reduce((n, i) => n + Number(i.quantity), 0);
  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const shipping = 0;
  const tax = 0;
  const total = subtotal + shipping + tax;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["marketplace-cart"] });
  }

  async function setQty(item: CartItem, quantity: number) {
    haptic();
    setPulse(item.id);
    window.setTimeout(() => setPulse((id) => (id === item.id ? null : id)), 220);
    if (quantity <= 0) {
      await remove(item);
      return;
    }
    const { error } = await updateCartItemQuantity(item.id, quantity, actorId);
    if (error) toast.error(error);
    else void refresh();
  }

  async function remove(item: CartItem) {
    haptic("warning");
    setLeaving(item.id);
    window.setTimeout(async () => {
      const { error } = await removeCartItem(item.id, actorId);
      setLeaving(null);
      if (error) toast.error(error);
      else {
        toast.success("Removed from cart");
        void refresh();
      }
    }, 180);
  }

  return (
    <MarketplaceShell hideTopBar hideNav variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white in-[.native-shop]:bg-[var(--native-canvas,#F3F5F8)]">
        <header className="shrink-0 px-5 pb-1 pt-[max(0.55rem,env(safe-area-inset-top))]">
          <Link to="/shop" className="mx-auto block w-[9.5rem]" aria-label="TIJAR home">
            <TijarLogo compact className="mx-auto" />
          </Link>
          <p className="-mt-0.5 text-center text-[9px] font-extrabold uppercase tracking-[0.22em] text-[#0B1F4D]/55">
            Shop smart. Live well.
          </p>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex items-end justify-between gap-3 pt-3">
            <h1 className="text-[1.65rem] font-extrabold leading-none tracking-tight text-[#0B1F4D]">Shopping Cart</h1>
            <p className="pb-0.5 text-[13px] font-medium text-[#9CA3AF]" aria-live="polite">
              {itemCountLabel(pieceCount)}
            </p>
          </div>

          {cartQuery.isLoading && items.length === 0 ? (
            <p className="pt-10 text-center text-sm text-muted-foreground">Loading cart…</p>
          ) : items.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <ShoppingCart className="mx-auto size-10 text-[#0B1F4D]/30" aria-hidden />
              <p className="mt-3 text-lg font-extrabold text-[#0B1F4D]">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">Add products from the shop — they stay here until you checkout.</p>
              <Button className="mt-5 min-h-11 rounded-xl bg-[#0B1F4D] font-bold" asChild>
                <Link to="/shop">Continue shopping</Link>
              </Button>
            </div>
          ) : (
            <>
              <ul className="mt-4 space-y-2.5" aria-label="Cart items">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border border-[#EEF1F5] bg-white p-3 shadow-[0_1px_0_rgba(11,31,77,0.04)] transition-all duration-200",
                      leaving === item.id && "translate-x-4 opacity-0",
                    )}
                  >
                    <Link
                      to="/shop/p/$productId"
                      params={{ productId: item.product_id }}
                      className="size-[4.4rem] shrink-0 overflow-hidden rounded-xl bg-[#F3F4F6]"
                      aria-label={item.product_name}
                    >
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-[#9CA3AF]">
                          <Store className="size-6" />
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-extrabold text-[#0B1F4D]">{item.product_name}</p>
                          <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{item.variant_label || formatUnitWord(item.unit, Number(item.quantity))}</p>
                          <p className="mt-1 text-[15px] font-extrabold text-[#1F7A4D]">
                            {formatPricePerUnit(Number(item.unit_price), item.unit, formatNgn)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#9CA3AF] hover:bg-muted hover:text-[#B42318]"
                          aria-label={`Remove ${item.product_name} from cart`}
                          onClick={() => void remove(item)}
                        >
                          <Trash2 className="size-[18px]" strokeWidth={1.75} />
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3" role="group" aria-label={`Quantity for ${item.product_name}`}>
                        <button
                          type="button"
                          className="flex size-8 items-center justify-center rounded-full text-lg font-semibold text-[#6B7280]"
                          aria-label="Decrease quantity"
                          onClick={() => void setQty(item, Number(item.quantity) - unitStep(item.unit))}
                        >
                          −
                        </button>
                        <span
                          className={cn(
                            "min-w-[1.25rem] text-center text-[15px] font-extrabold text-[#0B1F4D] transition-transform duration-200",
                            pulse === item.id && "scale-125",
                          )}
                          aria-live="polite"
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="flex size-8 items-center justify-center rounded-full text-lg font-semibold text-[#6B7280]"
                          aria-label="Increase quantity"
                          onClick={() => void setQty(item, Number(item.quantity) + unitStep(item.unit))}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <section className="mt-4 rounded-2xl border border-[#EEF1F5] p-4" aria-label="Order summary">
                <h2 className="text-[17px] font-extrabold text-[#0B1F4D]">Order Summary</h2>
                <dl className="mt-3 space-y-2 text-[14px]">
                  <div className="flex justify-between">
                    <dt className="text-[#6B7280]">Subtotal</dt>
                    <dd className="font-semibold text-[#0B1F4D]">{formatNgn(subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#6B7280]">Shipping</dt>
                    <dd className="font-extrabold uppercase tracking-wide text-[#1F7A4D]">{shipping === 0 ? "FREE" : formatNgn(shipping)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#6B7280]">Tax</dt>
                    <dd className="font-semibold text-[#0B1F4D]">{formatNgn(tax)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-[#EEF1F5] pt-2.5">
                    <dt className="text-[16px] font-extrabold text-[#0B1F4D]">Total</dt>
                    <dd className="text-[18px] font-extrabold text-[#1F7A4D]">{formatNgn(total)}</dd>
                  </div>
                </dl>
              </section>

              <Button
                className="mt-4 min-h-[3.25rem] w-full rounded-xl bg-[#0B1F4D] text-[16px] font-extrabold text-white hover:bg-[#0B1F4D]/90"
                asChild
              >
                <Link to="/shop/checkout">
                  <Lock className="mr-2 size-4" />
                  Proceed to Checkout
                </Link>
              </Button>
              <p className="mt-3 flex items-start justify-center gap-2 text-center text-[12px] leading-snug text-[#1F7A4D]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-extrabold">Secure Checkout</span>
                  <span className="block text-[#6B7280]">Your data is protected and encrypted</span>
                </span>
              </p>
            </>
          )}
        </div>

        <nav
          className="grid shrink-0 grid-cols-4 border-t border-[#EEF1F5] pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
          aria-label="Cart navigation"
        >
          {(
            [
              { to: "/shop" as const, label: "Home", icon: Home },
              { to: "/shop/discover" as const, label: "Shop", icon: ShoppingBag },
              { to: "/shop/cart" as const, label: "Cart", icon: ShoppingCart, badge: pieceCount, current: true },
              { to: "/shop/profile" as const, label: "Account", icon: UserRound },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const current = "current" in tab && tab.current;
            return (
              <Link
                key={tab.label}
                to={tab.to}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  current ? "text-[#1F7A4D]" : "text-[#9CA3AF]",
                )}
              >
                <Icon className={cn("size-5", current && "stroke-[2.4]")} />
                {tab.label}
                {"badge" in tab && tab.badge > 0 ? (
                  <span className="absolute right-[22%] top-0.5 flex size-4 items-center justify-center rounded-full bg-[#1F7A4D] text-[9px] font-extrabold text-white">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </MarketplaceShell>
  );
}
