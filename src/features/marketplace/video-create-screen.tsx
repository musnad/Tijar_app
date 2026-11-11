"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, Store, XCircle } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { SellerVideoStudioScreen } from "@/features/videos/seller-video-studio-screen";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { VerifyToPostCard } from "@/features/business/verify-to-post";
import { canUseBusinessMode } from "@/lib/account-mode";
import { shopQueryAllowsPost } from "@/lib/kyc/kyc-runtime";
import { fetchCart, fetchMyBusinessUpgradeRequest } from "@/services/marketplace-service";

export function VideoCreateScreen({
  openCamera = false,
  productId,
}: {
  openCamera?: boolean;
  productId?: string;
}) {
  const { profile, session, refreshProfile } = useAuth();
  const businessQuery = usePrimaryBusiness(profile?.id);
  const business = businessQuery.data?.business ?? null;
  const canSell = Boolean(session && profile && canUseBusinessMode(profile));
  const hasBusinessAccount = Boolean(canSell && business);

  const cartQuery = useQuery({
    queryKey: ["marketplace-cart", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchCart(profile!.id)).items,
  });
  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;

  const requestQuery = useQuery({
    queryKey: ["business-upgrade-request", profile?.id],
    enabled: Boolean(profile?.id) && !hasBusinessAccount,
    queryFn: async () => {
      const res = await fetchMyBusinessUpgradeRequest(profile!.id);
      if (res.error) throw new Error(res.error);
      return res.request;
    },
  });

  const request = requestQuery.data;
  const checkingAccess = Boolean(
    session && profile && (canSell ? businessQuery.isPending : requestQuery.isPending),
  );
  const approvedWaitingShop = request?.status === "approved" && canUseBusinessMode(profile) && !business;

  useEffect(() => {
    if (request?.status === "approved") void refreshProfile();
  }, [request?.status, refreshProfile]);

  return (
    <MarketplaceShell
      cartCount={cartCount}
      hideTopBar
      hideNav={checkingAccess || (hasBusinessAccount && shopQueryAllowsPost(businessQuery.data))}
      variant="feed"
    >
      {hasBusinessAccount && profile && business ? (
        shopQueryAllowsPost(businessQuery.data) ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-2 px-3 pb-2 pt-[max(0.4rem,env(safe-area-inset-top))]">
            <Button className="min-h-10 flex-1 rounded-full bg-[#0B1F4D] text-xs font-extrabold" type="button">
              Post photo
            </Button>
            <Button className="min-h-10 flex-1 rounded-full text-xs font-extrabold" variant="outline" asChild>
              <Link to="/shop/create-order">Place your order</Link>
            </Button>
          </div>
          <SellerVideoStudioScreen
            businessId={business.id}
            profileId={profile.id}
            autoCamera={openCamera}
            initialProductId={productId}
          />
        </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <VerifyToPostCard />
          </div>
        )
      ) : (
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {checkingAccess ? (
          <p className="mt-10 text-center text-sm font-semibold text-muted-foreground">Checking your account…</p>
        ) : (
          <SellAccessCard
            signedIn={Boolean(session)}
            status={request?.status}
            businessName={request?.business_name}
            canSell={canSell}
            approvedWaitingShop={approvedWaitingShop}
          />
        )}
      </div>
      )}
    </MarketplaceShell>
  );
}

function SellAccessCard({
  signedIn,
  status,
  businessName,
  canSell,
  approvedWaitingShop,
}: {
  signedIn: boolean;
  status?: "pending" | "approved" | "rejected";
  businessName?: string | null;
  canSell: boolean;
  approvedWaitingShop: boolean;
}) {
  if (!signedIn) {
    return (
      <Gate
        icon={<Store className="size-8 text-primary" />}
        title="Sell on TIJAR"
        body="Sign in first. Selling is for business accounts. If you do not have one yet, you can send a request after you sign in."
      >
        <Button className="mt-4 min-h-11 w-full rounded-xl font-bold" asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </Gate>
    );
  }

  if (status === "pending") {
    return (
      <Gate
        icon={<Clock3 className="size-8 text-primary" />}
        title="Request sent"
        body={`Your business request${businessName ? ` for ${businessName}` : ""} is waiting for admin approval. You can sell after it is approved.`}
      >
        <Button className="mt-4 min-h-11 w-full rounded-xl font-bold" asChild>
          <Link to="/shop/business-apply">View request</Link>
        </Button>
      </Gate>
    );
  }

  if (status === "rejected") {
    return (
      <Gate
        icon={<XCircle className="size-8 text-destructive" />}
        title="Request not approved"
        body="Update your shop details and send a new request. Selling stays locked until an admin approves you."
      >
        <Button className="mt-4 min-h-11 w-full rounded-xl font-bold" asChild>
          <Link to="/shop/business-apply">Send a new request</Link>
        </Button>
      </Gate>
    );
  }

  if (canSell || status === "approved" || approvedWaitingShop) {
    return (
      <Gate
        icon={<CheckCircle2 className="size-8 text-primary" />}
        title="You are approved"
        body="Your request was approved. Open the dashboard to finish your business account, then you can post products here."
      >
        <Button className="mt-4 min-h-11 w-full rounded-xl font-bold" asChild>
          <Link to="/app">Create business account</Link>
        </Button>
      </Gate>
    );
  }

  return (
    <Gate
      icon={<Store className="size-8 text-primary" />}
      title="Business account required"
      body="Sell is only for people with a TIJAR business account. Send a request. If an admin approves it, you can create your business account and start posting."
    >
      <Button className="mt-4 min-h-11 w-full rounded-xl font-bold" asChild>
        <Link to="/shop/business-apply">Send a request</Link>
      </Button>
    </Gate>
  );
}

function Gate({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">{icon}</span>
      <p className="mt-4 text-lg font-extrabold">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
