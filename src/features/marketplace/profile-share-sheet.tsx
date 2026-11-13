"use client";

import { ArrowUpFromLine, Link2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { dataUrlToFile } from "@/lib/marketing/resize-image";
import {
  composeProfileShareCard,
  profileShareCaption,
  type ProfileShareStyle,
} from "@/lib/share/compose-profile-card";
import { cn } from "@/lib/utils";

const STYLES: ProfileShareStyle[] = ["navy", "market", "dusk"];

const STRIPE: Record<ProfileShareStyle, string> = {
  navy: "from-[#071226] via-[#0B1F4D] to-[#1F7A4D]",
  market: "from-[#0A2A1C] via-[#145C3A] to-[#0B1F4D]",
  dusk: "from-[#101828] via-[#1B3A6B] to-[#C9A227]",
};

export function ProfileShareSheet({
  open,
  onOpenChange,
  name,
  handle,
  url,
  avatarUrl,
  onShared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  handle: string;
  url: string;
  avatarUrl?: string | null;
  onShared?: () => void;
}) {
  const [style, setStyle] = useState<ProfileShareStyle>("navy");
  const [cardSrc, setCardSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cleanHandle = handle.replace(/^@/, "");

  useEffect(() => {
    if (!open) return;
    let live = true;
    setCardSrc(null);
    void composeProfileShareCard({ name, handle: cleanHandle, url, avatarUrl, style })
      .then((src) => {
        if (live) setCardSrc(src);
      })
      .catch(() => {
        if (live) setCardSrc(null);
      });
    return () => {
      live = false;
    };
  }, [avatarUrl, cleanHandle, handle, name, open, style, url]);

  if (!open) return null;

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=6&color=0B1F4D&bgcolor=ffffff&data=${encodeURIComponent(url)}`;
  const caption = profileShareCaption({ name, handle: cleanHandle, url });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  async function shareLink() {
    setBusy(true);
    try {
      const src = cardSrc ?? (await composeProfileShareCard({ name, handle: cleanHandle, url, avatarUrl, style }));
      const file = dataUrlToFile(src, `TIJAR-${cleanHandle || "profile"}.jpg`);
      const canFiles =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (canFiles && typeof navigator.share === "function") {
        await navigator.share({
          files: [file],
          title: `${name} on TIJAR`,
          text: caption,
        });
        onShared?.();
        toast.success("Share to WhatsApp status or a group — the TIJAR card goes with it.");
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${name} on TIJAR`, text: caption, url });
        return;
      }
      const link = document.createElement("a");
      link.href = src;
      link.download = file.name;
      link.click();
      await copyLink();
      toast.success("Card saved. Paste it into WhatsApp status or a group.");
    } catch (err) {
      if (err instanceof Error && /abort|cancel/i.test(err.message)) return;
      await copyLink();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#071226]">
      <button
        type="button"
        className={cn("absolute inset-0 bg-gradient-to-br", STRIPE[style])}
        aria-label="Change background style"
        onClick={() => setStyle((cur) => STYLES[(STYLES.indexOf(cur) + 1) % STYLES.length]!)}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-90",
          "bg-[repeating-linear-gradient(-28deg,transparent_0_70px,rgba(255,255,255,0.05)_70px_140px)]",
        )}
      />

      <header className="relative z-10 flex items-center justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex size-11 items-center justify-center rounded-full text-white"
          aria-label="Close"
        >
          <X className="size-6" />
        </button>
        <p className="text-[11px] font-extrabold tracking-[0.28em] text-white/80">TIJAR</p>
        <span className="size-11" />
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-7 pb-4">
        <div className="relative w-full max-w-[22rem]">
          <div className="rounded-[2rem] bg-white px-5 pb-6 pt-16 shadow-[0_24px_50px_rgba(0,0,0,0.28)]">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-[5.5rem] rounded-full object-cover ring-[6px] ring-white"
                />
              ) : (
                <span className="flex size-[5.5rem] items-center justify-center rounded-full bg-[#0B1F4D] text-2xl font-extrabold text-white ring-[6px] ring-white">
                  {(name.trim().slice(0, 1) || "T").toUpperCase()}
                </span>
              )}
            </div>
            <p className="text-center text-[22px] font-extrabold leading-tight text-[#111827]">{name}</p>
            <p className="mt-0.5 text-center text-[15px] font-semibold text-[#6B7280]">@{cleanHandle}</p>
            <div className="relative mx-auto mt-4 size-[13.5rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Scan this TIJAR profile" className="size-full object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/tijar-logo.png"
                alt=""
                className="absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white object-cover p-0.5 ring-2 ring-white"
              />
            </div>
            <p className="mt-1 text-center text-[17px] font-extrabold tracking-[0.18em] text-[#0B1F4D]">TIJAR</p>
            <p className="text-center text-[12px] font-bold text-[#1F7A4D]">tijar.ng</p>
          </div>
        </div>
        <p className="mt-4 text-center text-[12px] font-semibold text-white/70">Tap background to change style</p>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="flex min-h-[4.6rem] flex-col items-center justify-center gap-1 rounded-[1.35rem] bg-white text-[#111827] shadow-sm"
        >
          <Link2 className="size-6 text-[#0B1F4D]" />
          <span className="text-[15px] font-semibold">Copy link</span>
        </button>
        <button
          type="button"
          onClick={() => void shareLink()}
          disabled={busy}
          className="flex min-h-[4.6rem] flex-col items-center justify-center gap-1 rounded-[1.35rem] bg-white text-[#111827] shadow-sm"
        >
          <ArrowUpFromLine className={cn("size-6 text-[#0B1F4D]", busy && "animate-pulse text-[#1F7A4D]")} />
          <span className="text-[15px] font-semibold">{busy ? "Sharing…" : "Share link"}</span>
        </button>
      </div>
    </div>
  );
}
