"use client";

import { Link } from "@tanstack/react-router";
import { AlertTriangle, Package, Warehouse } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { MiniStatCard } from "@/features/app-layout/mini-stat-card";
import { ProductListItem } from "@/features/app-layout/product-list-item";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { fetchProductsDashboard } from "@/services/product-analytics-service";
import { formatNgn } from "@/utils/money";

export function ProductsScreen({ businessId }: { businessId: string }) {
  const { t } = useTranslation();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["products-dashboard", businessId],
    queryFn: async () => {
      const result = await fetchProductsDashboard(businessId);
      if (result.error) throw new Error(result.error);
      return result.data!;
    },
  });

  const labels = {
    lowStockLabel: t("app.products.lowStockBadge"),
    inStockLabel: t("app.products.inStockBadge"),
    serviceLabel: t("app.products.kindService"),
    adjustStockLabel: t("app.products.adjustStock"),
    profitLabel: t("app.products.profitLabel"),
    lossLabel: t("app.products.lossLabel"),
    salesCountLabel: t("app.products.salesLinked"),
    costShortLabel: t("app.products.costShort"),
    perJobLabel: t("app.products.perJob"),
  };

  return (
    <>
      <AppPageHeader
        title={t("app.products.title")}
        subtitle={t("app.products.subtitle")}
        action={
          <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
            <Button variant="outline" className="min-h-10 rounded-xl font-bold" asChild>
              <Link to="/app/products/scan-shop">{t("app.shopScan.shortCta")}</Link>
            </Button>
            <Button className="min-h-10 rounded-xl font-bold" asChild>
              <Link to="/app/products/new">{t("app.products.newFab")}</Link>
            </Button>
          </div>
        }
      />

      {isLoading && <p className="mt-8 text-muted-foreground">…</p>}

      {isError && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">{t("app.products.loadFailed")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-10 rounded-xl" onClick={() => void refetch()}>
              {t("app.common.retry")}
            </Button>
            <Button className="min-h-10 rounded-xl font-bold" asChild>
              <Link to="/app/products/new">{t("app.products.newFab")}</Link>
            </Button>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="dashboard-summary-card mt-5 rounded-2xl p-4 text-primary-foreground shadow-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-white/85">{t("app.products.inventoryValue")}</p>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">{formatNgn(data.totalInventoryValue)}</p>
                <p className="mt-1 text-xs text-white/75">{t("app.products.inventoryHint")}</p>
              </div>
              <div className="border-s border-white/20 ps-4">
                <p className="text-sm font-medium text-white/85">{t("app.products.inventoryProfit")}</p>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">{formatNgn(data.totalInventoryProfit)}</p>
                <p className="mt-1 text-xs text-white/75">{t("app.products.inventoryProfitHint")}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <MiniStatCard
              label={t("app.products.statSkus")}
              value={String(data.productCount)}
              icon={Package}
              iconClassName="bg-teal-100 text-teal-800"
            />
            <MiniStatCard
              label={t("app.products.statLowStock")}
              value={String(data.lowStockCount)}
              icon={AlertTriangle}
              iconClassName="bg-primary/10 text-primary"
            />
            <MiniStatCard
              label={t("app.products.statInStock")}
              value={String(data.inStock.length)}
              icon={Warehouse}
              iconClassName="bg-primary/15 text-primary"
            />
          </div>

          {data.allProducts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">{t("app.products.empty")}</p>
              <Button className="mt-4 min-h-11 rounded-xl font-bold" asChild>
                <Link to="/app/products/new">{t("app.products.newFab")}</Link>
              </Button>
            </div>
          ) : (
            <>
              {data.lowStock.length > 0 && (
                <section className="mt-6">
                  <h2 className="font-bold">{t("app.products.lowStockTitle")}</h2>
                  <ul className="mt-3 overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-sm">
                    {data.lowStock.map((p) => (
                      <ProductListItem
                        key={p.id}
                        product={p}
                        stats={data.salesStats[p.id]}
                        {...labels}
                      />
                    ))}
                  </ul>
                </section>
              )}

              <section className="mt-6">
                <h2 className="font-bold">
                  {data.lowStock.length > 0 ? t("app.products.allInStockTitle") : t("app.products.listTitle")}
                </h2>
                <ul className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  {(data.lowStock.length > 0 ? data.inStock : data.allProducts).map((p) => (
                    <ProductListItem
                      key={p.id}
                      product={p}
                      stats={data.salesStats[p.id]}
                      {...labels}
                    />
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
