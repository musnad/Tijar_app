"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, ChevronRight, Heart, ShoppingBag, Star, Store, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TijarLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { useAuth } from "@/features/auth/auth-context";
import { formatPricePerUnit, formatUnitWord, lineTotal, normalizeQty, unitMinQty, unitStep } from "@/lib/catalogue/units";
import { formatServiceDates, serviceLabel } from "@/lib/catalogue/service-schedule";
import { parseVariantList } from "@/lib/catalogue/variants";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n/context";
import { displayShopName, shopLinkSlug } from "@/lib/shop-names";
import { cn } from "@/lib/utils";
import { isProductLiked, likeProduct, isProductSaved } from "@/lib/shop-social";
import { useDoubleTap } from "@/lib/use-double-tap";
import {
  addToCart,
  fetchCart,
  fetchMarketplaceProduct,
  toggleFavoriteProduct,
} from "@/services/marketplace-service";
import { enrollInService } from "@/services/customer-service";
import { formatNgn, percentOff } from "@/utils/money";

const COLOUR_HEX: Record<string, string> = {
  navy: "#001B3A",
  green: "#12805C",
  black: "#111111",
  white: "#F4F4F5",
  red: "#B42318",
  gold: "#C6A15B",
  brown: "#6F4E37",
};

function colourHex(label: string): string {
  const key = label.trim().toLowerCase();
  return COLOUR_HEX[key] ?? "#D4D4D8";
}

export function ProductDetailScreen({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [variantId, setVariantId] = useState("");
  const [busy, setBusy] = useState<"cart" | "buy" | null>(null);
  const [qty, setQty] = useState(1);

  const productQuery = useQuery({
    queryKey: ["marketplace-product", productId],
    queryFn: async () => {
      const res = await fetchMarketplaceProduct(productId);
      if (res.error) throw new Error(res.error);
      if (!res.product) throw new Error("This product is not available.");
      return res.product;
    },
  });

  const cartQuery = useQuery({
    queryKey: ["marketplace-cart", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchCart(profile!.id)).items,
  });

  const product = productQuery.data;
  const variants = parseVariantList(product?.variants);
  const colours = useMemo(() => {
    const fromVariants = variants.map((v) => v.colour ?? v.label).filter(Boolean);
    const unique = [...new Set(fromVariants)];
    return unique;
  }, [variants]);
  const selectedVariant = variants.find((v) => v.id === variantId) ?? variants[0] ?? null;
  const selectedColour = selectedVariant?.colour ?? selectedVariant?.label ?? colours[0] ?? "";

  useEffect(() => {
    if (!variantId && variants.length) {
      const green = variants.find((v) => (v.colour ?? v.label).toLowerCase() === "green");
      setVariantId((green ?? variants[0])!.id);
    }
  }, [variantId, variants]);

  const gallery = useMemo(() => {
    if (!product) return [];
    const urls = [product.image_url, ...(product.extra_image_urls ?? [])].filter(Boolean) as string[];
    return [...new Set(urls)];
  }, [product]);

  const livePrice =
    product?.sale_price == null ? null : Number(product.sale_price) + (selectedVariant?.price_delta ?? 0);
  const compareAt = product?.attributes?.compare_at ? Number(product.attributes.compare_at) : null;
  const off = livePrice != null ? percentOff(livePrice, compareAt) : null;
  const rating = product?.attributes?.rating ? Number(product.attributes.rating) : null;
  const reviews = product?.attributes?.reviews ? Number(product.attributes.reviews) : null;
  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;
  const inStock = product?.kind === "service" || product?.is_available !== false;
  const mock = isMockFeedId(productId);
  const actorId = profile?.id ?? "guest";

  useEffect(() => {
    setLiked(isProductLiked(actorId, productId));
    setSaved(isProductSaved(actorId, productId));
  }, [actorId, productId]);

  function onGalleryScroll() {
    const el = scroller.current;
    if (!el || gallery.length === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setImageIndex(Math.min(gallery.length - 1, Math.max(0, i)));
  }

  function goToImage(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setImageIndex(i);
  }

  function burstLike() {
    haptic("success");
    likeProduct(actorId, productId);
    setLiked(true);
    setHeartBurst(true);
    window.setTimeout(() => setHeartBurst(false), 700);
    toast.success("Liked");
  }

  const onImageTap = useDoubleTap(burstLike);

  async function add(buyNow: boolean) {
    haptic(buyNow ? "success" : "light");
    if (!product) return;
    if (livePrice == null) {
      toast.message("This product has no price yet. Message the shop instead.");
      return;
    }
    if (buyNow) {
      void navigate({ to: "/shop/buy", search: { productId: product.id, qty } });
      return;
    }
    if (!session || !profile) {
      toast.message("Sign in to add items to your cart.");
      void navigate({ to: "/login" });
      return;
    }
    setBusy("cart");
    const { error } = await addToCart(profile.id, {
      businessId: product.business_id,
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      unitPrice: livePrice,
      quantity: qty,
      imageUrl: product.image_url,
      variantId: selectedVariant?.id,
      variantLabel: selectedColour || selectedVariant?.label,
    });
    setBusy(null);
    if (error) {
      toast.error(error);
      return;
    }
    setSaved(true);
    await queryClient.invalidateQueries({ queryKey: ["marketplace-cart"] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace-favorites"] });
    toast.success("Added to cart and Saved Products");
  }

  async function favorite() {
    haptic();
    if (!product) return;
    if (mock) {
      toast.error("This listing is not available.");
      return;
    }
    if (!session || !profile) {
      toast.message("Sign in to save products.");
      void navigate({ to: "/login" });
      return;
    }
    const { favorited, error } = await toggleFavoriteProduct(profile.id, productId);
    if (error) toast.error(error);
    else {
      setSaved(favorited);
      toast.success(favorited ? "Saved to Saved Products" : "Removed from saved");
    }
  }

  return (
    <MarketplaceShell hideTopBar hideNav variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Link to="/shop" className="justify-self-start" aria-label="TIJAR home">
            <TijarLogo variant="mark" className="h-8 w-auto" />
          </Link>
          <div className="text-center">
            <h1 className="text-[15px] font-extrabold text-[color:var(--brand-navy,#001B3A)]">{t("shop.product.details")}</h1>
            <span className="mx-auto mt-1 block h-0.5 w-16 rounded-full bg-[color:var(--brand-navy,#001B3A)]" />
          </div>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-full"
              aria-label={saved ? "Remove from saved" : "Save product"}
              aria-pressed={saved}
              onClick={() => void favorite()}
            >
              <Heart className={cn("size-6", saved ? "fill-red-500 text-red-500" : "text-[color:var(--brand-navy,#001B3A)]")} />
            </button>
            <Link
              to="/shop/cart"
              className="relative flex size-11 items-center justify-center rounded-full"
              aria-label={`Cart, ${cartCount} items`}
            >
              <ShoppingBag className="size-6 text-[color:var(--brand-navy,#001B3A)]" />
              {cartCount > 0 ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-white">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              ) : mock ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-white">
                  2
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {productQuery.isLoading && (
            <div className="px-4 pt-2" aria-busy="true" aria-live="polite">
              <div className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
              <p className="mt-4 text-sm text-muted-foreground">Loading product…</p>
            </div>
          )}
          {productQuery.isError && (
            <p className="px-4 pt-6 text-sm text-destructive" role="alert">
              {productQuery.error instanceof Error ? productQuery.error.message : "Could not load this product."}
            </p>
          )}

          {product && (
            <div className="px-4 pb-4">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-white">
                <div
                  ref={scroller}
                  className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  onScroll={onGalleryScroll}
                  onClick={onImageTap}
                  aria-label={`${product.name} photos. Double tap to like.`}
                >
                  {(gallery.length ? gallery : [null]).map((src, i) => (
                    <div key={src ?? "empty"} className="h-[min(38vh,16.5rem)] w-full shrink-0 snap-center bg-muted">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={`${product.name}, photo ${i + 1} of ${gallery.length}`}
                          className="size-full object-contain p-2"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-sm text-muted-foreground">No photo</div>
                      )}
                    </div>
                  ))}
                </div>
                {heartBurst || liked ? (
                  <Heart
                    className={cn(
                      "pointer-events-none absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 text-red-500 transition-all",
                      heartBurst ? "scale-110 fill-red-500 opacity-100" : "scale-75 fill-red-500/0 opacity-0",
                    )}
                    aria-hidden
                  />
                ) : null}
                {gallery.length > 1 && (
                  <div className="flex justify-center gap-1 pb-2">
                    {gallery.map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        aria-label={`Show photo ${i + 1}`}
                        aria-current={i === imageIndex}
                        className={cn("size-2 rounded-full", i === imageIndex ? "bg-primary" : "bg-muted-foreground/30")}
                        onClick={() => goToImage(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
              {gallery.length > 1 && (
                <ul className="mt-2 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {gallery.map((src, i) => (
                    <li key={src}>
                      <button
                        type="button"
                        onClick={() => goToImage(i)}
                        className={cn(
                          "size-14 overflow-hidden rounded-xl border-2",
                          i === imageIndex ? "border-primary" : "border-transparent",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="size-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-4 text-[13px] font-bold text-muted-foreground">{product.name}</p>
              {serviceLabel(product) && (
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-primary">
                  {serviceLabel(product)}
                  {formatServiceDates(product) ? ` · ${formatServiceDates(product)}` : ""}
                </p>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-[28px] font-black tabular-nums leading-none text-[color:var(--brand-navy,#001B3A)]">
                  {livePrice != null ? formatPricePerUnit(livePrice, product.unit, formatNgn) : "Ask seller"}
                </p>
                {off != null ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold text-white">
                    {off}% OFF
                  </span>
                ) : null}
                {rating != null && Number.isFinite(rating) ? (
                  <p className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-[color:var(--brand-navy,#001B3A)]">
                    <Stars value={rating} />
                    <span>
                      {rating.toFixed(1)}
                      {reviews ? ` (${reviews})` : ""}
                    </span>
                  </p>
                ) : (
                  <p className="ml-auto text-[12px] font-medium text-muted-foreground">No reviews yet</p>
                )}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                <span className={cn("size-2 rounded-full", inStock ? "bg-primary" : "bg-destructive")} />
                {product.kind === "service" ? "Open for enrolment" : inStock ? "In Stock" : "Out of stock"}
              </p>

              <div className="mt-4 flex items-center gap-3 border-y border-border py-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Store className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground">Seller</p>
                  <p className="flex items-center gap-1 font-extrabold text-[color:var(--brand-navy,#001B3A)]">
                    <span className="truncate">{displayShopName(product.business_name)}</span>
                    <BadgeCheck className="size-4 shrink-0 fill-primary text-white" aria-label="Verified seller" />
                  </p>
                </div>
                <Link
                  to="/b/$slug"
                  params={{ slug: shopLinkSlug(product.business_slug, product.business_id) }}
                  className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full border border-border px-3 text-[12px] font-bold text-[color:var(--brand-navy,#001B3A)]"
                >
                  View Store
                  <ChevronRight className="size-4" />
                </Link>
              </div>

              {colours.length > 0 && (
                <div className="mt-4">
                  <p className="text-[13px] font-semibold text-muted-foreground">Color</p>
                  <div className="mt-2 flex gap-4" role="radiogroup" aria-label="Color">
                    {colours.map((colour) => {
                      const match = variants.find((v) => (v.colour ?? v.label) === colour);
                      const active = selectedColour === colour;
                      return (
                        <button
                          key={colour}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            haptic();
                            if (match) setVariantId(match.id);
                          }}
                          className="flex flex-col items-center gap-1"
                        >
                          <span
                            className={cn(
                              "size-10 rounded-full border-2",
                              active ? "border-[color:var(--brand-navy,#001B3A)] ring-2 ring-offset-2 ring-[color:var(--brand-navy,#001B3A)]" : "border-transparent",
                            )}
                            style={{ backgroundColor: colourHex(colour) }}
                          />
                          <span className="text-[12px] font-medium text-muted-foreground">{colour}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {product.description && (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
              )}

              {product.kind !== "service" ? (
                <div className="mt-4">
                  <p className="text-[13px] font-semibold text-muted-foreground">
                    {product.unit === "yard" || product.unit === "metre"
                      ? `How many ${formatUnitWord(product.unit, 2)}?`
                      : "Quantity"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="size-10 rounded-xl p-0"
                      onClick={() => setQty((n) => normalizeQty(n - unitStep(product.unit), product.unit))}
                    >
                      −
                    </Button>
                    <Input
                      className="h-10 w-20 rounded-xl text-center font-extrabold"
                      inputMode="decimal"
                      value={qty}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next)) return;
                        setQty(Math.max(unitMinQty(product.unit), next));
                      }}
                      onBlur={() => setQty((n) => normalizeQty(n, product.unit))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="size-10 rounded-xl p-0"
                      onClick={() => setQty((n) => normalizeQty(n + unitStep(product.unit), product.unit))}
                    >
                      +
                    </Button>
                    <span className="text-sm font-semibold text-muted-foreground">{formatUnitWord(product.unit, qty)}</span>
                  </div>
                  {livePrice != null ? (
                    <p className="mt-2 text-[13px] font-semibold text-[color:var(--brand-navy,#001B3A)]">
                      {qty} {formatUnitWord(product.unit, qty)} × {formatNgn(livePrice)} = {formatNgn(lineTotal(livePrice, qty))}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {product.kind === "service" && <div className="mt-4"><ServiceEnrollForm productId={product.id} /></div>}
            </div>
          )}
        </div>

        {product && (
          <div className="grid shrink-0 grid-cols-2 gap-2 px-4 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              className="min-h-12 rounded-2xl bg-[color:var(--brand-navy,#001B3A)] font-extrabold text-white hover:bg-[color:var(--brand-navy,#001B3A)]/90"
              disabled={!inStock || livePrice == null || busy !== null}
              onClick={() => void add(false)}
            >
              <ShoppingBag className="mr-1.5 size-4" />
              {busy === "cart" ? t("shop.product.adding") : t("shop.product.addToCart")}
            </Button>
            <Button
              type="button"
              className="min-h-12 rounded-2xl bg-primary font-extrabold text-white"
              disabled={!inStock || livePrice == null || busy !== null}
              onClick={() => void add(true)}
            >
              <Zap className="mr-1.5 size-4 fill-current" />
              {busy === "buy" ? "…" : t("shop.product.buyNow")}
            </Button>
          </div>
        )}
      </div>
    </MarketplaceShell>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("size-3.5", n <= Math.floor(value) ? "fill-primary text-primary" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

function ServiceEnrollForm({ productId }: { productId: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await enrollInService({ productId, fullName, email, phone });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Enrolment sent. The business now has your details.");
    setFullName("");
    setEmail("");
    setPhone("");
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-card p-4">
      <h2 className="text-sm font-extrabold">Enrol with your details</h2>
      <p className="mt-1 text-xs text-muted-foreground">Name plus email or phone. The seller gets this on their customer list.</p>
      <Input className="mt-3 min-h-11 rounded-xl" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      <Input className="mt-2 min-h-11 rounded-xl" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <Input className="mt-2 min-h-11 rounded-xl" placeholder="Phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      <Button type="button" className="mt-3 min-h-11 w-full rounded-xl font-bold" disabled={busy} onClick={() => void submit()}>
        Enrol
      </Button>
    </div>
  );
}
