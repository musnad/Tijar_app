"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Heart, MessageCircle, Package, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FeedImage } from "@/components/media/feed-image";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import {
  fetchActivityNotifications,
  markNotificationsRead,
  type ActivityNotification,
} from "@/services/social-service";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function kindIcon(kind: ActivityNotification["kind"]) {
  if (kind === "place_order" || kind === "place_order_paid" || kind === "new_post" || kind === "purchase") return Package;
  if (kind === "comment" || kind === "comment_reply") return MessageCircle;
  if (kind === "follow_back") return Heart;
  return UserPlus;
}

function NotificationRowLink({
  item,
  className,
  children,
}: {
  item: ActivityNotification;
  className?: string;
  children: ReactNode;
}) {
  if (item.kind === "place_order" || item.kind === "place_order_paid") {
    return (
      <Link to="/shop/create-order" search={{ tab: "orders" }} className={className}>
        {children}
      </Link>
    );
  }
  if (item.listingId) {
    return (
      <Link to="/shop/order-now/$listingId" params={{ listingId: item.listingId }} className={className}>
        {children}
      </Link>
    );
  }
  if (item.productId) {
    return (
      <Link to="/shop/p/$productId" params={{ productId: item.productId }} className={className}>
        {children}
      </Link>
    );
  }
  if (item.videoPostId) {
    return (
      <Link to="/shop" search={{ v: item.videoPostId }} className={className}>
        {children}
      </Link>
    );
  }
  if (item.kind === "order_update") {
    return item.orderId ? (
      <Link to="/shop/orders/$orderId" params={{ orderId: item.orderId }} className={className}>
        {children}
      </Link>
    ) : (
      <Link to="/shop/orders" className={className}>
        {children}
      </Link>
    );
  }
  if (item.kind === "cart" || item.kind === "purchase") {
    return (
      <Link to="/app/orders" className={className}>
        {children}
      </Link>
    );
  }
  if (item.kind === "shop_reply") {
    return (
      <Link to="/shop/enquiries" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/shop" className={className}>
      {children}
    </Link>
  );
}

export function ActivityInboxScreen() {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["activity-inbox", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      try {
        const r = await fetchActivityNotifications(profile!.id);
        return r.error ? { items: [], unread: 0 } : r;
      } catch {
        return { items: [], unread: 0 };
      }
    },
  });

  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(profile!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
    },
  });

  if (!session || !profile) {
    return (
      <MarketplaceShell>
        <h1 className="text-xl font-extrabold">Notifications</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link to="/login" className="font-bold text-primary">
            Sign in
          </Link>{" "}
          to see follows and comments.
        </p>
      </MarketplaceShell>
    );
  }

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <MarketplaceShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tap a post to open it and buy or place your order.</p>
        </div>
        {unread > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full font-bold"
            onClick={() => markRead.mutate()}
            disabled={markRead.isPending}
          >
            Mark read
          </Button>
        ) : null}
      </div>

      {query.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Loading…</p> : null}
      {!query.isLoading && items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Bell className="mx-auto size-8 text-primary/40" />
          <p className="mt-3 font-extrabold">You are all caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">When someone follows you or comments, it appears here.</p>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {items.map((item) => {
          const Icon = kindIcon(item.kind);
          return (
            <li key={item.id}>
              <NotificationRowLink
                item={item}
                className={cn(
                  "flex gap-3 rounded-2xl border border-border p-3",
                  item.readAt ? "bg-card" : "border-primary/20 bg-primary/5",
                )}
              >
                <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-xs font-extrabold text-white">
                  {item.actorAvatar ? (
                    <FeedImage src={item.actorAvatar} alt="" eager width={88} />
                  ) : (
                    (item.actorName ?? "?").slice(0, 1)
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-white">
                    <Icon className="size-3" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-extrabold text-[color:var(--brand-navy,#001B3A)]">{item.title}</span>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-foreground">{item.body}</span>
                </span>
              </NotificationRowLink>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/shop/settings" className="font-bold text-primary">
          Notification settings
        </Link>
      </p>
    </MarketplaceShell>
  );
}
