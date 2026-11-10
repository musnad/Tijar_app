"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, Grid3x3, Package, Pencil, Search, Store, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { ProductCard } from "@/features/marketplace/product-card";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import {
  fetchProfileFollowers,
  fetchProfileFollowing,
  fetchProfilePosts,
  fetchProfileProducts,
  fetchPublicPerson,
  isFollowingPerson,
  type PublicFollower,
} from "@/services/public-profile-service";
import { toggleFollowPerson } from "@/services/social-service";
import { resolveCoverSrc } from "@/services/video-feed-service";

type Tab = "posts" | "products" | "followers" | "following";

function matches(hay: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return (hay ?? "").toLowerCase().includes(needle);
}

export function PublicProfileScreen({ profileId }: { profileId: string; postId?: string | null }) {
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("posts");
  const [query, setQuery] = useState("");
  const isOwn = profile?.id === profileId;

  const personQuery = useQuery({
    queryKey: ["public-person", profileId],
    queryFn: async () => {
      const r = await fetchPublicPerson(profileId);
      if (!r.person) throw new Error(r.error ?? "Profile not found");
      return r.person;
    },
  });
  const postsQuery = useQuery({
    queryKey: ["public-person-posts", profileId],
    queryFn: () => fetchProfilePosts(profileId),
  });
  const productsQuery = useQuery({
    queryKey: ["public-person-products", profileId],
    queryFn: () => fetchProfileProducts(profileId),
  });
  const followersQuery = useQuery({
    queryKey: ["public-person-followers", profileId],
    queryFn: () => fetchProfileFollowers(profileId),
  });
  const followingQuery = useQuery({
    queryKey: ["public-person-following", profileId],
    queryFn: () => fetchProfileFollowing(profileId),
  });
  const iFollowQuery = useQuery({
    queryKey: ["i-follow-person", profile?.id, profileId],
    enabled: Boolean(profile?.id) && profile?.id !== profileId,
    queryFn: () => isFollowingPerson(profile!.id, profileId),
  });

  const person = personQuery.data;
  const needle = query.trim().toLowerCase();
  const posts = useMemo(
    () => (postsQuery.data ?? []).filter((p) => matches(p.caption, needle) || matches(p.business_name, needle)),
    [postsQuery.data, needle],
  );
  const products = useMemo(
    () => (productsQuery.data ?? []).filter((p) => matches(p.name, needle) || matches(p.description, needle)),
    [productsQuery.data, needle],
  );
  const followers = useMemo(
    () => filterPeople(followersQuery.data ?? [], needle),
    [followersQuery.data, needle],
  );
  const following = useMemo(
    () => filterPeople(followingQuery.data ?? [], needle),
    [followingQuery.data, needle],
  );

  const followMut = useMutation({
    mutationFn: async () => {
      if (!session || !profile) throw new Error("Sign in to follow people.");
      return toggleFollowPerson(profile.id, {
        id: profileId,
        name: person?.fullName ?? "Member",
        handle: person?.handle ?? "member",
        avatarUrl: person?.avatarUrl ?? null,
        kind: "person",
      });
    },
    onSuccess: async (r) => {
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.following ? "Following" : "Unfollowed");
        await queryClient.invalidateQueries({ queryKey: ["public-person-followers", profileId] });
        await queryClient.invalidateQueries({ queryKey: ["i-follow-person"] });
        await queryClient.invalidateQueries({ queryKey: ["followed-people"] });
        await queryClient.invalidateQueries({ queryKey: ["shop-followers"] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const iFollow = Boolean(iFollowQuery.data);

  const tabs: { id: Tab; label: string; count: number; icon: typeof Grid3x3 }[] = [
    { id: "posts", label: "Posts", count: postsQuery.data?.length ?? 0, icon: Grid3x3 },
    { id: "products", label: "Products", count: productsQuery.data?.length ?? 0, icon: Package },
    { id: "followers", label: "Followers", count: followersQuery.data?.length ?? 0, icon: Users },
    { id: "following", label: "Following", count: followingQuery.data?.length ?? 0, icon: Users },
  ];

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white in-[.native-shop]:bg-[var(--native-canvas,#F3F5F8)]">
        <header className="shrink-0 border-b border-border pt-[max(0.45rem,env(safe-area-inset-top))] in-[.native-shop]:border-0 in-[.native-shop]:bg-transparent">
          <div className="flex items-center gap-2 px-3 pb-2">
            <button
              type="button"
              onClick={() => void navigate({ to: "/shop" })}
              className="flex size-10 items-center justify-center rounded-full"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-extrabold">
                {person ? `@${person.handle}` : "Profile"}
              </h1>
            </div>
            {isOwn ? (
              <Button asChild size="sm" variant="outline" className="rounded-full font-bold">
                <Link to="/shop/edit-profile">
                  <Pencil className="mr-1 size-3.5" />
                  Edit
                </Link>
              </Button>
            ) : null}
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {personQuery.isLoading ? (
            <p className="px-5 pt-8 text-sm text-muted-foreground">Loading profile…</p>
          ) : personQuery.isError || !person ? (
            <p className="mx-5 mt-8 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              This profile is not available.
            </p>
          ) : (
            <>
              <section className="flex items-center gap-5 px-5 pt-4">
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatarUrl} alt="" className="size-[5.25rem] shrink-0 rounded-full object-cover ring-2 ring-primary/25" />
                ) : (
                  <span className="flex size-[5.25rem] shrink-0 items-center justify-center rounded-full bg-muted text-xl font-extrabold ring-2 ring-primary/25">
                    {person.fullName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="grid min-w-0 flex-1 grid-cols-3 text-center">
                  {tabs.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="px-1"
                      onClick={() => setTab(item.id)}
                    >
                      <p className="text-[17px] font-extrabold tabular-nums leading-none">{item.count}</p>
                      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{item.label}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="px-5 pt-3.5">
                <p className="flex items-center gap-1 text-[15px] font-extrabold leading-tight">
                  <span className="truncate">{person.fullName}</span>
                  {person.verifiedBadge ? (
                    <BadgeCheck className="size-4 shrink-0 fill-primary text-white" aria-label="Verified" />
                  ) : null}
                </p>
                {person.bio ? <p className="mt-1 text-[13px] leading-snug text-foreground">{person.bio}</p> : null}
                <div className="mt-3 flex gap-2">
                  {isOwn ? (
                    <Button asChild className="min-h-10 flex-1 rounded-lg font-extrabold">
                      <Link to="/shop/profile">Account</Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="min-h-10 flex-1 rounded-lg font-extrabold"
                      variant={iFollow ? "outline" : "default"}
                      disabled={followMut.isPending}
                      onClick={() => followMut.mutate()}
                    >
                      {iFollow ? "Following" : "Follow"}
                    </Button>
                  )}
                  {person.shopSlug ? (
                    <Button asChild variant="outline" className="min-h-10 rounded-lg font-extrabold">
                      <Link to="/b/$slug" params={{ slug: person.shopSlug }}>
                        <Store className="mr-1.5 size-4" />
                        Shop
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </section>

              <div className="relative mx-5 mt-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search posts, products, followers"
                  className="h-11 rounded-full border-border bg-muted/70 pl-10"
                />
              </div>

              <nav className="mt-3 grid grid-cols-4 border-b border-border">
                {tabs.map((item) => {
                  const active = tab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={cn(
                        "relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px]",
                        active ? "font-extrabold text-primary" : "font-semibold text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                      {active ? <span className="absolute inset-x-4 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
                    </button>
                  );
                })}
              </nav>

              {tab === "posts" && (
                posts.length === 0 ? (
                  <Empty text={needle ? "No posts match that search." : "No posts yet."} />
                ) : (
                  <ul className="grid grid-cols-3 gap-px bg-border md:grid-cols-4 lg:grid-cols-5">
                    {posts.map((post) => {
                      const cover = post.image_urls?.[0] || resolveCoverSrc(post.cover_path) || post.business_logo_url;
                      return (
                        <li key={post.id}>
                          <Link to="/shop" search={{ v: post.id }} className="block aspect-square bg-muted">
                            {cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cover} alt="" className="size-full object-cover" />
                            ) : (
                              <span className="flex size-full items-center justify-center text-[10px] font-bold text-muted-foreground">Post</span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )
              )}

              {tab === "products" && (
                products.length === 0 ? (
                  <Empty text={needle ? "No products match that search." : "No products listed yet."} />
                ) : (
                  <ul className="grid grid-cols-2 gap-2.5 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
                    {products.map((product) => (
                      <li key={product.id}>
                        <ProductCard product={product} compact />
                      </li>
                    ))}
                  </ul>
                )
              )}

              {tab === "followers" && (
                <PeopleList people={followers} empty={needle ? "No followers match that search." : "No followers yet."} />
              )}
              {tab === "following" && (
                <PeopleList people={following} empty={needle ? "No matches." : "Not following anyone yet."} />
              )}
            </>
          )}

        </div>
      </div>
    </MarketplaceShell>
  );
}

function filterPeople(people: PublicFollower[], needle: string): PublicFollower[] {
  if (!needle) return people;
  return people.filter((p) => matches(p.name, needle) || matches(p.handle, needle));
}

function PeopleList({ people, empty }: { people: PublicFollower[]; empty: string }) {
  if (people.length === 0) return <Empty text={empty} />;
  return (
    <ul className="space-y-2 px-4 py-4">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            to="/shop/u/$profileId"
            params={{ profileId: person.id }}
            className="flex min-h-[3.5rem] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2"
          >
            {person.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.avatarUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
                {person.name.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold">{person.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">@{person.handle}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{text}</p>;
}
