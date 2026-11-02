"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, MessageCircle, Package, ShoppingCart, ThumbsUp, UserPlus } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/auth-context";
import { enableWebPush, notificationsGranted, syncWebPushSubscription, vapidPublicKey } from "@/lib/web-push";
import { fetchActivityNotifications, type ActivityNotification } from "@/services/social-service";

const SEEN_KEY = "tijar-notif-last-seen";
const PERMISSION_KEY = "tijar-notif-permission-asked";

/** Mirror an activity item to a real browser (desktop) notification. */
function showBrowserNotification(item: ActivityNotification) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (window.Notification.permission !== "granted") return;
  try {
    const options: NotificationOptions = { body: item.body, tag: `tijar-${item.id}` };
    if (item.actorAvatar) options.icon = item.actorAvatar;
    const note = new window.Notification(item.title, options);
    note.onclick = () => {
      window.focus();
      window.location.href = target(item);
      note.close();
    };
  } catch {
    // Some browsers block constructing notifications outside a service worker.
  }
}

function PopupIcon({ kind }: { kind: ActivityNotification["kind"] }) {
  if (kind === "place_order" || kind === "place_order_paid" || kind === "purchase" || kind === "new_post") return <Package className="size-4" />;
  if (kind === "cart") return <ShoppingCart className="size-4" />;
  if (kind === "like") return <ThumbsUp className="size-4" />;
  if (kind === "comment" || kind === "comment_reply") return <MessageCircle className="size-4" />;
  if (kind === "follow_back") return <Heart className="size-4" />;
  return <UserPlus className="size-4" />;
}

function target(n: ActivityNotification): string {
  if (n.productId) return `/shop/p/${n.productId}`;
  if (n.href) return n.href;
  if (n.videoPostId) return `/shop?v=${n.videoPostId}`;
  return "/shop/notifications";
}

let soundCtx: AudioContext | null = null;

/** TIJAR's own short two-note chime (no audio file needed). */
function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    soundCtx = soundCtx ?? new Ctx();
    const ctx = soundCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0 },
      { freq: 1318.5, start: 0.12 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.22, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + 0.24);
    }
  } catch {
    // Autoplay policies may block audio until the user interacts — ignore.
  }
}

function PopupCard({ item, onClose }: { item: ActivityNotification; onClose: () => void }) {
  return (
    <a
      href={target(item)}
      onClick={onClose}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background/98 p-3 text-left shadow-lg backdrop-blur"
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-xs font-extrabold text-white">
        {item.actorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.actorAvatar} alt="" className="size-full object-cover" />
        ) : (
          (item.actorName ?? "?").slice(0, 1)
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-white">
          <PopupIcon kind={item.kind} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-extrabold text-[color:var(--brand-navy,#001B3A)]">{item.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted-foreground">{item.body}</span>
      </span>
    </a>
  );
}

/**
 * Social-style on-screen notification pop-up (TikTok/Instagram style).
 * Polls for new activity and surfaces the newest unseen item as a toast card.
 */
export function NotificationPopup() {
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ["activity-popup", profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const r = await fetchActivityNotifications(profile!.id);
        return r.items ?? [];
      } catch {
        return [] as ActivityNotification[];
      }
    },
  });

  const items = query.data;

  useEffect(() => {
    if (!profile?.id) return;
    void (async () => {
      if (notificationsGranted()) {
        // Same device, new login — make sure the subscription is stored for this profile.
        await syncWebPushSubscription();
        return;
      }
      if (window.localStorage.getItem(PERMISSION_KEY)) return;
      window.localStorage.setItem(PERMISSION_KEY, "1");
      await enableWebPush();
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (!items || items.length === 0 || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SEEN_KEY);
    if (!stored) {
      window.localStorage.setItem(SEEN_KEY, items[0]!.id);
      return;
    }
    const idx = items.findIndex((n) => n.id === stored);
    const fresh = idx === -1 ? items.slice(0, 1) : items.slice(0, idx);
    if (fresh.length === 0) return;
    window.localStorage.setItem(SEEN_KEY, items[0]!.id);
    playNotificationSound();
    // When Web Push is configured the service worker shows the OS notification,
    // so only fall back to an in-page browser notification here.
    if (!vapidPublicKey() && document.visibilityState !== "visible") {
      for (const item of fresh) showBrowserNotification(item);
    }
    const top = fresh[0]!;
    toast.custom((id) => <PopupCard item={top} onClose={() => toast.dismiss(id)} />, {
      duration: 5_000,
      position: "top-center",
    });
  }, [items]);

  return null;
}
