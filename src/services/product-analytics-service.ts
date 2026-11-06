import { listProducts } from "@/services/product-service";
import { fetchProductSalesStats } from "@/services/product-sales-stats-service";
import { inventoryProfit, inventoryValue, isLowStock } from "@/utils/stock-math";
import type { Product, ProductSalesStats } from "@/types/database";

export type ProductsDashboard = {
  productCount: number;
  lowStockCount: number;
  totalInventoryValue: number;
  totalInventoryProfit: number;
  lowStock: Product[];
  inStock: Product[];
  allProducts: Product[];
  salesStats: Record<string, ProductSalesStats>;
};

export async function fetchProductsDashboard(businessId: string): Promise<{
  data: ProductsDashboard | null;
  error: string | null;
}> {
  const [productsRes, statsRes] = await Promise.all([
    listProducts(businessId),
    fetchProductSalesStats(businessId),
  ]);
  const { data: rows, error } = productsRes;
  if (error) return { data: null, error };
  // Stats are optional — never block the product list if sales columns are missing.

  const lowStock = rows.filter(
    (p) =>
      (p.kind ?? "goods") === "goods" &&
      isLowStock(Number(p.stock_quantity), Number(p.low_stock_threshold)),
  );
  const inStock = rows.filter(
    (p) =>
      (p.kind ?? "goods") === "service" ||
      !isLowStock(Number(p.stock_quantity), Number(p.low_stock_threshold)),
  );

  const totalInventoryValue = rows.reduce(
    (sum, p) => sum + inventoryValue(Number(p.stock_quantity), p.cost_price != null ? Number(p.cost_price) : null),
    0,
  );
  const totalInventoryProfit = rows.reduce(
    (sum, p) =>
      sum +
      inventoryProfit(
        Number(p.stock_quantity),
        p.cost_price != null ? Number(p.cost_price) : null,
        p.sale_price != null ? Number(p.sale_price) : null,
      ),
    0,
  );

  return {
    data: {
      productCount: rows.length,
      lowStockCount: lowStock.length,
      totalInventoryValue,
      totalInventoryProfit,
      lowStock,
      inStock,
      allProducts: rows,
      salesStats: statsRes.error ? {} : statsRes.byProductId,
    },
    error: null,
  };
}
