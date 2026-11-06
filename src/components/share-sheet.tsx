"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Copy, Send, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { FeedImage } from "@/components/media/feed-image";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { cn } from "@/lib/utils";
import { ensurePersonalShop } from "@/services/marketplace-service";
import { fetchDmPeople, sendPostToRecipients, type DmPerson } from "@/services/direct-chat-service";
import { publishStoryReshare } from "@/services/story-service";

type ShareSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
  url: string;
  imageUrl?: string | null;
  mediaKind?: "image" | "video";
  productId?: string | null;
  price?: number | null;
  onShared?: () => void;
};

function BrandIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" className={className}>
      <path d={path} />
    </svg>
  );
}

const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";
const X_PATH =
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
const FACEBOOK_PATH =
  "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z";
const TELEGRAM_PATH =
  "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z";

export function ShareSheet({
  open,
  onOpenChange,
  title,
  text,
  url,
  imageUrl,
  mediaKind = "image",
  productId,
  price,
  onShared,
}: ShareSheetProps) {
  const { profile, session } = useAuth();
  const shop = usePrimaryBusiness(profile?.id);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<"main" | "dm">("main");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const counted = useRef(false);

  const peopleQuery = useQuery({
    queryKey: ["share-dm-people", profile?.id],
    enabled: open && panel === "dm" && Boolean(profile?.id),
    queryFn: async () => (await fetchDmPeople(profile!.id)).people,
  });

  useEffect(() => {
    if (!open) {
      setCopied(false);
      counted.current = false;
      setPanel("main");
      setSearch("");
      setPicked(new Set());
      setBusy(false);
    }
  }, [open]);

  function markShared() {
    if (counted.current) return;
    counted.current = true;
    onShared?.();
  }

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const message = `${text} — ${url}`;
  const people = peopleQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, search]);

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url });
      markShared();
      onOpenChange(false);
    } catch {
      // dismissed
    }
  }

  function openPlatform(href: string) {
    markShared();
    window.open(href, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {
        toast.error("Could not copy the link");
        return;
      }
    }
    setCopied(true);
    markShared();
    toast.success("Link copied");
  }

  async function addToStory() {
    if (!session || !profile) {
      toast.message("Sign in to add this to your story.");
      return;
    }
    if (!imageUrl) {
      toast.error("This post has no photo or video to add to your story.");
      return;
    }
    setBusy(true);
    let businessId = shop.data?.business?.id ?? null;
    if (!businessId) {
      const created = await ensurePersonalShop({
        profileId: profile.id,
        displayName: profile.full_name || "My story",
      });
      if (created.error || !created.businessId) {
        setBusy(false);
        toast.error(created.error ?? "Create your shop to add to your story.");
        return;
      }
      businessId = created.businessId;
    }
    const posted = await publishStoryReshare({
      businessId,
      profileId: profile.id,
      mediaUrl: imageUrl,
      mediaKind,
      overlayText: title,
      productId,
      price,
    });
    setBusy(false);
    if (posted.error) {
      toast.error(posted.error);
      return;
    }
    markShared();
    void queryClient.invalidateQueries({ queryKey: ["live-stories"] });
    toast.success("Added to your story");
    onOpenChange(false);
  }

  function togglePerson(person: DmPerson) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(person.key)) next.delete(person.key);
      else next.add(person.key);
      return next;
    });
  }

  async function sendDms() {
    if (!session || !profile) {
      toast.message("Sign in to send in Direct.");
      return;
    }
    const selected = people.filter((p) => picked.has(p.key));
    if (selected.length === 0) {
      toast.message("Pick at least one person.");
      return;
    }
    setBusy(true);
    const result = await sendPostToRecipients({
      profileId: profile.id,
      recipients: selected,
      title: title || text,
      url,
    });
    setBusy(false);
    if (result.sent === 0) {
      toast.error(result.error ?? "Could not send.");
      return;
    }
    markShared();
    void queryClient.invalidateQueries({ queryKey: ["shop-inbox"] });
    toast.success(result.sent === 1 ? "Sent in Direct" : `Sent to ${result.sent} people`);
    onOpenChange(false);
  }

  const platforms = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      color: "#25D366",
      path: WHATSAPP_PATH,
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
    },
    {
      key: "x",
      label: "X",
      color: "#0B1F4D",
      path: X_PATH,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    },
    {
      key: "facebook",
      label: "Facebook",
      color: "#1877F2",
      path: FACEBOOK_PATH,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      key: "telegram",
      label: "Telegram",
      color: "#229ED9",
      path: TELEGRAM_PATH,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
        <SheetHeader className="px-5 pb-1 pt-3 text-left">
          <SheetTitle className="text-[16px] font-extrabold">{panel === "dm" ? "Send in Direct" : "Share"}</SheetTitle>
        </SheetHeader>

        {panel === "dm" ? (
          <div className="px-5 pb-3">
            <Input
              className="min-h-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people or shops"
            />
            <ul className="mt-3 max-h-[40vh] overflow-y-auto">
              {peopleQuery.isLoading ? <li className="py-6 text-center text-sm text-muted-foreground">Loading…</li> : null}
              {!peopleQuery.isLoading && filtered.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">Follow people or shops to send this in Direct.</li>
              ) : null}
              {filtered.map((person) => {
                const on = picked.has(person.key);
                return (
                  <li key={person.key}>
                    <button
                      type="button"
                      onClick={() => togglePerson(person)}
                      className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0A2540] text-sm font-extrabold text-white">
                        {person.avatarUrl ? <FeedImage src={person.avatarUrl} alt="" width={88} /> : person.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold">{person.name}</span>
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full border",
                          on ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border",
                        )}
                      >
                        {on ? <Check className="size-3.5" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-full border border-border text-sm font-extrabold"
                onClick={() => setPanel("main")}
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || picked.size === 0}
                className="min-h-11 flex-1 rounded-full bg-primary text-sm font-extrabold text-white disabled:opacity-50"
                onClick={() => void sendDms()}
              >
                {busy ? "Sending…" : `Send${picked.size ? ` (${picked.size})` : ""}`}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                {imageUrl ? <FeedImage src={imageUrl} alt="" width={160} /> : <Share2 className="size-5 text-muted-foreground" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold text-foreground">{title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted-foreground">{text}</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 px-5 pb-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void addToStory()}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#0A2540] text-sm font-extrabold text-white disabled:opacity-60"
              >
                <Camera className="size-4" />
                {busy ? "Adding…" : "Add to story"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!session || !profile) {
                    toast.message("Sign in to send in Direct.");
                    return;
                  }
                  setPanel("dm");
                }}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#1F7A4D] text-sm font-extrabold text-white"
              >
                <Send className="size-4" />
                Send in Direct
              </button>
            </div>

            {canNativeShare ? (
              <div className="px-5 pb-2">
                <button
                  type="button"
                  onClick={() => void nativeShare()}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-extrabold text-white"
                >
                  <Share2 className="size-4" />
                  Share via other apps
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-4 gap-2 px-5 py-3">
              {platforms.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => openPlatform(p.href)}
                  className="flex flex-col items-center gap-1.5 rounded-2xl py-2 transition-colors hover:bg-muted"
                >
                  <span className="flex size-12 items-center justify-center rounded-full text-white" style={{ backgroundColor: p.color }}>
                    <BrandIcon path={p.path} className="size-6" />
                  </span>
                  <span className="text-[11px] font-bold text-foreground">{p.label}</span>
                </button>
              ))}
            </div>

            <div className="px-5 pb-1 pt-1">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-extrabold text-foreground"
              >
                {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                {copied ? "Link copied" : "Copy link"}
              </button>
            </div>
            <p className={cn("select-none truncate px-5 pt-2 text-center text-[11px] text-muted-foreground")}>{url}</p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
