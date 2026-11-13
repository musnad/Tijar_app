import { Link } from "@tanstack/react-router";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { ProductCard } from "@/features/marketplace/product-card";
import { formatShopPlaceLine } from "@/lib/maps/shop-coords";
import type { PublicBusiness, PublicProduct } from "@/types/database";

type Crumb = { label: string; href?: string };

export function PublicDirectoryScreen({
  title,
  intro,
  crumbs,
  shops,
  products,
  related,
  page,
  pageSize,
  total,
  pageHref,
}: {
  title: string;
  intro: string;
  crumbs: Crumb[];
  shops: PublicBusiness[];
  products: PublicProduct[];
  related?: Array<{ label: string; href: string }>;
  page?: number;
  pageSize?: number;
  total?: number;
  pageHref?: (page: number) => string;
}) {
  const current = page ?? 1;
  const size = pageSize ?? shops.length;
  const count = total ?? shops.length;
  const pages = size > 0 ? Math.ceil(count / size) : 1;

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="min-h-0 flex-1 overflow-y-auto bg-white pb-10">
        <header className="px-4 pb-3 pt-[max(0.7rem,env(safe-area-inset-top))]">
          <p className="text-[11px] font-extrabold tracking-[0.2em] text-[#1F7A4D]">TIJAR</p>
          <nav aria-label="Breadcrumb" className="mt-2 text-[12px] text-[#4B5563]">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`}>
                {i > 0 ? <span className="px-1">/</span> : null}
                {crumb.href ? (
                  <a href={crumb.href} className="font-semibold text-[#0B1F4D] underline-offset-2 hover:underline">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="font-bold text-[#0B1F4D]">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="mt-2 text-[26px] font-extrabold leading-tight text-[#0B1F4D]">{title}</h1>
          <p className="mt-2 text-[14px] leading-snug text-[#4B5563]">{intro}</p>
        </header>

        {related && related.length > 0 ? (
          <nav aria-label="Related categories" className="flex gap-2 overflow-x-auto px-4 pb-3">
            {related.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full bg-[#F3F4F6] px-3 py-1.5 text-[12px] font-bold text-[#0B1F4D]"
              >
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}

        <section className="px-4 pb-4">
          <h2 className="text-[15px] font-extrabold text-[#0B1F4D]">Vendors on Tijar</h2>
          {shops.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No public vendors for this search yet.</p>
          ) : (
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
                        <img src={shop.logo_url} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        shop.business_name.slice(0, 1)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{shop.business_name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {formatShopPlaceLine(shop) || shop.category_name || "Shop on TIJAR"}
                        {shop.is_verified ? " · Verified" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {products.length > 0 ? (
          <section className="px-4">
            <h2 className="text-[15px] font-extrabold text-[#0B1F4D]">Products and services</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} compact />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {pageHref && pages > 1 ? (
          <nav aria-label="Pagination" className="flex justify-center gap-2 px-4 pt-6 text-sm font-bold">
            {current > 1 ? (
              <a href={pageHref(current - 1)} className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-[#0B1F4D]">
                Previous
              </a>
            ) : null}
            <span className="px-2 py-1.5 text-muted-foreground">
              {current} / {pages}
            </span>
            {current < pages ? (
              <a href={pageHref(current + 1)} className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-[#0B1F4D]">
                Next
              </a>
            ) : null}
          </nav>
        ) : null}
      </div>
    </MarketplaceShell>
  );
}
