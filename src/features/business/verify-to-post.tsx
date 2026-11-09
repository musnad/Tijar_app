import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { isShopIdentityVerified } from "@/lib/kyc/bytid";

export function VerifyToPostCard() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 text-center">
      <ShieldCheck className="mx-auto size-10 text-[#1F7A4D]" />
      <h1 className="mt-3 text-xl font-extrabold text-[#0B1F4D]">Verify your shop first</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Complete NIN lookup and live face verification before you post products, videos, stories, or place-your-order
        listings.
      </p>
      <Button className="mt-5 min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90" asChild>
        <Link to="/app/business">Verify with NIN</Link>
      </Button>
    </div>
  );
}

export function RequireShopKyc({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const shop = usePrimaryBusiness(profile?.id);
  const business = shop.data?.business;
  if (shop.isLoading) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Checking verification…</p>;
  }
  if (business && !isShopIdentityVerified(business)) {
    return <VerifyToPostCard />;
  }
  return children;
}
