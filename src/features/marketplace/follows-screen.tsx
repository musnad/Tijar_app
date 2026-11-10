"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FeedImage } from "@/components/media/feed-image";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { useAuth } from "@/features/auth/auth-context";
import { usernameMatchesName } from "@/lib/shop-names";
import { cn } from "@/lib/utils";
import { fetchFollowedBusinesses } from "@/services/marketplace-service";
import { toggleFollowBusiness } from "@/services/video-feed-service";
import {
  fetchFollowersForMe,
  fetchPeopleIFollow,
  followBack,
  toggleFollowPerson,
  type SocialConnection,
} from "@/services/social-service";

function Avatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
      {src ? <FeedImage src={src} alt="" width={88} /> : name.slice(0, 1)}
    </span>
  );
}

export function FollowsScreen() {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"shops" | "people">("shops");

  const shopsQuery = useQuery({
    queryKey: ["followed-shops", profile?.id ?? "guest"],
    queryFn: async () => {
      try {
        return (await fetchFollowedBusinesses(profile?.id ?? "guest")).shops;
      } catch {
        return [];
      }
    },
  });

  const peopleQuery = useQuery({
    queryKey: ["followed-people", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      try {
        return (await fetchPeopleIFollow(profile!.id)).people;
      } catch {
        return [];
      }
    },
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["followed-shops"] }),
      queryClient.invalidateQueries({ queryKey: ["followed-people"] }),
      queryClient.invalidateQueries({ queryKey: ["shop-followers"] }),
      queryClient.invalidateQueries({ queryKey: ["video-follows"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-inbox"] }),
    ]);
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
        <NativePageHeader title="Following" subtitle="Shops and people you follow." showBack />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="mt-1 grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-[0_6px_20px_rgba(11,31,58,0.06)]">
        <button
          type="button"
          className={cn("rounded-full py-2 text-xs font-bold", tab === "shops" ? "bg-[#0B1F3A] text-white" : "text-muted-foreground")}
          onClick={() => setTab("shops")}
        >
          Shops ({shopsQuery.data?.length ?? 0})
        </button>
        <button
          type="button"
          className={cn("rounded-full py-2 text-xs font-bold", tab === "people" ? "bg-[#0B1F3A] text-white" : "text-muted-foreground")}
          onClick={() => setTab("people")}
        >
          People ({peopleQuery.data?.length ?? 0})
        </button>
      </div>

      {tab === "shops" ? (
        <>
          {shopsQuery.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
          {!shopsQuery.isLoading && (shopsQuery.data?.length ?? 0) === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed p-6 text-center">
              <p className="font-semibold">You are not following any shops yet</p>
              <Button className="mt-4 rounded-xl" asChild>
                <Link to="/shop/discover">Discover shops</Link>
              </Button>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {(shopsQuery.data ?? []).map((shop) => (
              <li key={shop.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                <Avatar name={shop.business_name} src={shop.logo_url} />
                <Link to="/b/$slug" params={{ slug: shop.slug }} className="min-w-0 flex-1 font-bold">
                  {shop.business_name}
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {shop.category_name ?? "Shop"}
                  </span>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full font-bold"
                  onClick={async () => {
                    if (!session || !profile) return toast.message("Sign in to follow shops.");
                    const r = await toggleFollowBusiness(profile.id, shop.id, profile.full_name);
                    if (r.error) toast.error(r.error);
                    else {
                      toast.success(r.following ? "Following" : "Unfollowed");
                      await refresh();
                    }
                  }}
                >
                  Following
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {peopleQuery.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
          {!peopleQuery.isLoading && (peopleQuery.data?.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">You are not following anyone yet. Follow back from Followers.</p>
          ) : null}
          <ul className="mt-4 space-y-2">
            {(peopleQuery.data ?? []).map((person) => (
              <ConnectionRow
                key={person.profileId}
                person={person}
                onAction={async () => {
                  if (!profile) return;
                  const r = await toggleFollowPerson(profile.id, {
                    id: person.profileId,
                    name: person.name,
                    handle: person.handle,
                    avatarUrl: person.avatarUrl,
                    kind: "person",
                  });
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success("Unfollowed");
                    await refresh();
                  }
                }}
              />
            ))}
          </ul>
        </>
      )}
    </MarketplaceShell>
  );
}

export function FollowersScreen() {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const followersQuery = useQuery({
    queryKey: ["shop-followers", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      try {
        return (await fetchFollowersForMe(profile!.id)).people;
      } catch {
        return [];
      }
    },
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["shop-followers"] }),
      queryClient.invalidateQueries({ queryKey: ["followed-shops"] }),
      queryClient.invalidateQueries({ queryKey: ["followed-people"] }),
      queryClient.invalidateQueries({ queryKey: ["video-follows"] }),
      queryClient.invalidateQueries({ queryKey: ["followed-ids"] }),
      queryClient.invalidateQueries({ queryKey: ["video-feed"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-inbox"] }),
    ]);
  }

  return (
    <MarketplaceShell>
      <h1 className="text-xl font-extrabold">Followers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        People and shops that follow you. Follow back so they see you too.
      </p>
      {followersQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : null}
      {!followersQuery.isLoading && (followersQuery.data?.length ?? 0) === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-6 text-center">
          <p className="font-semibold">No followers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Share your shop or posts and new followers land here.</p>
        </div>
      ) : null}
      <ul className="mt-4 space-y-2">
        {(followersQuery.data ?? []).map((person) => (
          <ConnectionRow
            key={`${person.source}-${person.profileId}`}
            person={person}
            onAction={async () => {
              if (!session || !profile) return toast.message("Sign in to follow back.");
              const r = await followBack(profile.id, person);
              if (r.error) toast.error(r.error);
              else {
                toast.success(r.following ? `Following ${person.shopName ?? person.name}` : "Unfollowed");
                await refresh();
              }
            }}
          />
        ))}
      </ul>
        </div>
      </div>
    </MarketplaceShell>
  );
}

function ConnectionRow({ person, onAction }: { person: SocialConnection; onAction: () => void }) {
  const title = person.shopName ?? person.name;
  const hideName = usernameMatchesName(title, person.handle);
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <Link to="/shop/u/$profileId" params={{ profileId: person.profileId }}>
        <Avatar name={person.shopName ?? person.name} src={person.avatarUrl} />
      </Link>
      <Link to="/shop/u/$profileId" params={{ profileId: person.profileId }} className="min-w-0 flex-1">
        {hideName ? (
          <p className="truncate font-bold">@{person.handle}</p>
        ) : (
          <>
            <p className="truncate font-bold">{title}</p>
            <p className="truncate text-xs text-muted-foreground">@{person.handle}</p>
          </>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {person.source === "shop" ? "follows your shop" : "follows you"}
          {person.theyFollowYou && person.followingThem ? " · friends" : ""}
        </p>
      </Link>
      <Button
        size="sm"
        className={cn("rounded-full font-bold", person.followingThem && "bg-[color:var(--brand-navy,#001B3A)]")}
        variant={person.followingThem ? "default" : "outline"}
        onClick={onAction}
      >
        {person.followingThem ? "Following" : person.theyFollowYou ? "Follow back" : "Follow"}
      </Button>
    </li>
  );
}
