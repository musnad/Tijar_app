"use client";

import { Link2 } from "lucide-react";

import { formatNgn } from "@/utils/money";
import { cn } from "@/lib/utils";

/** Instagram-style link / product card on a story or post. */
export function CommerceSticker({
  title,
  price,
  imageUrl,
  host = "tijar.ng",
  onPay,
  className,
}: {
  title: string;
  price?: number | null;
  imageUrl?: string | null;
  host?: string;
  onPay?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-[16.5rem] items-center gap-2.5 rounded-2xl bg-black/72 p-2 pr-2.5 text-left shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Link2 className="size-5 text-white" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-extrabold leading-tight text-white">{title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-white/70">
          <Link2 className="size-3" />
          {host}
        </span>
        {price != null ? (
          <span className="mt-0.5 block text-[15px] font-black text-[#00B86B]">{formatNgn(price)}</span>
        ) : null}
      </span>
      {onPay ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPay();
          }}
          className="shrink-0 rounded-full bg-[#00B86B] px-3 py-1.5 text-[11px] font-extrabold text-white"
        >
          Buy now
        </button>
      ) : null}
    </div>
  );
}
