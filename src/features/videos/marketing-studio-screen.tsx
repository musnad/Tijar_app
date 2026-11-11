"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight, Globe, Package, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { StudioCreateTools } from "@/features/videos/studio-create-tools";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { listProducts } from "@/services/product-service";
import type { Product } from "@/types/database";
import { formatNgn } from "@/utils/money";

export function MarketingStudioScreen({
  businessId,
  businessName,
  profileId,
  shopChrome = false,
  initialProductId,
}: {
  businessId: string;
  businessName: string;
  profileId: string;
  shopChrome?: boolean;
  initialProductId?: string;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  const [productId, setProductId] = useState<string | null>(initialProductId ?? null);
  const [picking, setPicking] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["studio-products", businessId],
    queryFn: async () => {
      const r = await listProducts(businessId);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
  });

  const products = productsQuery.data ?? [];
  const product = products.find((p) => p.id === productId) ?? null;

  useEffect(() => {
    if (products.length === 0) return;
    setProductId((cur) => {
      if (cur && products.some((p) => p.id === cur)) return cur;
      if (initialProductId && products.some((p) => p.id === initialProductId)) return initialProductId;
      return products[0]!.id;
    });
  }, [products, initialProductId]);

  return (
    <div className={cn("bg-white", shopChrome && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
      {shopChrome ? (
        <header className="flex shrink-0 items-center justify-between px-4 pb-1 pt-[max(0.45rem,env(safe-area-inset-top))]">
          <Link
            to="/shop"
            className="text-[15px] font-extrabold tracking-[0.18em] text-[#0B1F4D]"
            aria-label="TIJAR home"
          >
            TIJAR
          </Link>
          <Sparkles className="size-4 text-[#1F7A4D]" />
        </header>
      ) : (
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#1F7A4D]">AI Marketing Studio</p>
          <Sparkles className="size-4 text-[#1F7A4D]" />
        </div>
      )}

      <div
        className={cn(
          shopChrome &&
            "min-h-0 flex-1 overflow-y-auto px-4 pb-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
        style={shopChrome ? { WebkitOverflowScrolling: "touch" } : undefined}
      >
        <h1 className="pt-2 text-[1.75rem] font-extrabold leading-[1.12] tracking-tight text-[#0B1F4D]">
          Write a prompt.
          <br />
          <span className="text-[#1F7A4D]">Grok designs it.</span>
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">
          Describe the flyer or advert the way you would on Grok. TIJAR designs it, then you post it to For You with your product.
        </p>
        <ol className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["1", "Product"],
            ["2", "Prompt"],
            ["3", "Post"],
          ].map(([n, label]) => (
            <li key={n} className="rounded-2xl bg-[#F3FBF6] px-2 py-2">
              <span className="block text-[11px] font-extrabold text-[#1F7A4D]">{n}</span>
              <span className="text-[12px] font-bold text-[#0B1F4D]">{label}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-[#0B1F4D]">
            <Package className="size-3.5 text-[#1F7A4D]" />
            Product to tag on the post
          </p>
          {productsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading catalogue…</p>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-center">
              <p className="text-sm font-bold text-[#0B1F4D]">Add a product first</p>
              <Button className="mt-3 min-h-10 rounded-xl bg-[#0B1F4D] text-white" asChild>
                <Link to="/app/products/new">New product</Link>
      </Button>
            </div>
          ) : picking || !product ? (
            <ul className="space-y-2">
              {products.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left",
                      p.id === productId ? "border-[#1F7A4D] bg-[#F3FBF6]" : "border-[#EEF1F5]",
                    )}
                    onClick={() => {
                      setProductId(p.id);
                      setPicking(false);
                    }}
                  >
                    <ProductThumb product={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold text-[#0B1F4D]">{p.name}</span>
                      <span className="block truncate text-[12px] text-[#9CA3AF]">
                        {p.sale_price != null ? formatNgn(Number(p.sale_price)) : "No price"} · {p.unit}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl border border-[#EEF1F5] p-3 text-left"
              onClick={() => setPicking(true)}
            >
              <ProductThumb product={product} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold text-[#0B1F4D]">{product.name}</span>
                <span className="mt-0.5 block truncate text-[12px] text-[#6B7280]">
                  {(product.description || product.notes || `${product.unit}`).slice(0, 72)}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-[#9CA3AF]" />
            </button>
          )}
        </div>

        <div className="relative mt-3">
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-[#EEF1F5] px-3 text-left"
            onClick={() => setLangOpen((v) => !v)}
            aria-expanded={langOpen}
          >
            <Globe className="size-4 text-[#1F7A4D]" />
            <span className="flex-1 text-[14px] font-semibold text-[#0B1F4D]">{LOCALE_LABELS[locale]}</span>
            <ChevronDown className={cn("size-4 text-[#9CA3AF] transition", langOpen && "rotate-180")} />
          </button>
          {langOpen ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-[#EEF1F5] bg-white py-1 shadow-lg">
              {LOCALES.map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-[#0B1F4D]"
                    onClick={() => {
                      setLocale(code);
                      setLangOpen(false);
                    }}
                  >
                    {LOCALE_LABELS[code]}
                    {code === locale ? <Check className="size-4 text-[#1F7A4D]" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <StudioCreateTools
          product={product}
          products={products}
          businessId={businessId}
          businessName={businessName}
          profileId={profileId}
          goal="sales"
          style="friendly"
          locale={locale}
        />
      </div>
    </div>
  );
}

function ProductThumb({ product }: { product: Product }) {
  if (product.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={product.image_url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
    );
  }
  return <span className="size-14 shrink-0 rounded-xl bg-[#F3F4F6]" />;
}

