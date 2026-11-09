"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { ProductCard } from "@/features/marketplace/product-card";
import { useAuth } from "@/features/auth/auth-context";
import { fetchFavoriteProducts } from "@/services/marketplace-service";

export function FavoritesScreen() {
  const { profile } = useAuth();

  const favQuery = useQuery({
    queryKey: ["marketplace-favorites", profile?.id ?? "guest"],
    queryFn: async () => {
      const res = await fetchFavoriteProducts(profile?.id ?? "guest");
      if (res.error) throw new Error(res.error);
      return res.products;
    },
  });

  return (
    <MarketplaceShell>
      <h1 className="text-xl font-extrabold">Saved Products</h1>
      <p className="mt-1 text-sm text-muted-foreground">Items you saved or added to cart.</p>

      <>
          {favQuery.isLoading && (
            <p className="mt-4 text-sm text-muted-foreground">Loading saved items…</p>
          )}
          {!favQuery.isLoading && (favQuery.data?.length ?? 0) === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <Heart className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 font-semibold">Nothing saved yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add to cart or tap the heart on a product to save it here.
              </p>
              <Button className="mt-4 rounded-xl font-bold" asChild>
                <Link to="/shop">Browse products</Link>
              </Button>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(favQuery.data ?? []).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
      </>
    </MarketplaceShell>
  );
}
