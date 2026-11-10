"use client";

import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { cn } from "@/lib/utils";
import { EditProfileForm } from "@/features/profile/edit-profile-form";
import { useAuth } from "@/features/auth/auth-context";

export function ShopEditProfileScreen() {
  const { profile, session, loading } = useAuth();

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
        <NativePageHeader title="Edit Profile" showBack />
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-8"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {!loading && (!session || !profile) && (
          <Button className="mt-6 min-h-11 w-full rounded-full font-bold" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        )}
        {profile && <EditProfileForm profile={profile} afterSave="/shop/profile" />}
      </div>
      </div>
    </MarketplaceShell>
  );
}
