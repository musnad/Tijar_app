import { Link } from "@tanstack/react-router";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { ProductCard } from "@/features/marketplace/product-card";
import { categorySlug } from "@/lib/seo/catalog";
import type { PublicBusiness, PublicProduct } from "@/types/database";
import { formatShopPlaceLine } from "@/lib/maps/shop-coords";

export function PublicCatalogScreen({
  title,
  intro,
  products,
  shops,
  categories,
}: {
  title: string;
  intro: string;
  products: PublicProduct[];
  shops: PublicBusiness[];
  categories?: string[];
}) {
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="min-h-0 flex-1 overflow-y-auto bg-white pb-10">
        <header className="px-4 pb-3 pt-[max(0.7rem,env(safe-area-inset-top))]">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-[#1F7A4D]">TIJAR</p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-tight text-[#0B1F4D]">{title}</h1>
          <p className="mt-2 text-[14px] leading-snug text-[#4B5563]">{intro}</p>
        </header>

        {categories && categories.length > 0 ? (
          <nav aria-label="Categories" className="flex gap-2 overflow-x-auto px-4 pb-3">
            {categories.slice(0, 24).map((name) => (
              <Link
                key={name}
                to="/shop/c/$category"
                params={{ category: categorySlug(name) }}
                className="shrink-0 rounded-full bg-[#F3F4F6] px-3 py-1.5 text-[12px] font-bold text-[#0B1F4D]"
              >
                {name}
              </Link>
            ))}
          </nav>
        ) : null}

        {shops.length > 0 ? (
          <section className="px-4 pb-4">
            <h2 className="text-[15px] font-extrabold text-[#0B1F4D]">Shops on TIJAR</h2>
            <ul className="mt-2 grid gap-2">
              {shops.map((shop) => (
                <li key={shop.id}>
                  <Link
                    to="/b/$slug"
                    params={{ slug: shop.slug }}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-border px-3 py-2"
                  >
                    <span className="flex size-11 items-center justify-center overflow-hidden rounded-full bg-[#0B1F4D] text-sm font-extrabold text-white">
                      {shop.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shop.logo_url} alt="" className="size-full object-cover" />
                      ) : (
                        shop.business_name.slice(0, 1)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{shop.business_name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {formatShopPlaceLine(shop) || shop.category_name || "Shop on TIJAR"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="px-4">
          <h2 className="text-[15px] font-extrabold text-[#0B1F4D]">Products to buy on TIJAR</h2>
          {products.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No listings yet. Explore more shops on TIJAR.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} compact />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </MarketplaceShell>
  );
}
