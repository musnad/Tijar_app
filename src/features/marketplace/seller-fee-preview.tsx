"use client";

import { platformFeeSplit } from "@/lib/platform-fee";
import { formatNgn } from "@/utils/money";

export function SellerFeePreview({ price }: { price: number }) {
  const split = platformFeeSplit(price);
  if (split.gross <= 0) return null;
  return (
    <div className="mt-3 rounded-2xl border border-[#1F7A4D]/20 bg-[#F4FBF7] p-3 text-[13px]">
      <p className="font-extrabold text-[#0B1F4D]">When this sale is paid</p>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Product price</dt>
          <dd className="font-bold">{formatNgn(split.gross)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Platform fee (3%, min ₦50)</dt>
          <dd className="font-bold">− {formatNgn(split.fee)}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-[#1F7A4D]/15 pt-1">
          <dt className="font-extrabold text-[#0B1F4D]">You receive</dt>
          <dd className="font-extrabold text-[#1F7A4D]">{formatNgn(split.net)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function SellerFeeResult({
  gross,
  fee,
  net,
}: {
  gross: number;
  fee?: number | null;
  net?: number | null;
}) {
  const split = platformFeeSplit(gross);
  const shownFee = fee != null && fee > 0 ? fee : split.fee;
  const shownNet = net != null && net >= 0 ? net : split.net;
  return (
    <p className="mt-1 text-[12px] text-muted-foreground">
      Price {formatNgn(gross)} · TIJAR fee {formatNgn(shownFee)} · You receive {formatNgn(shownNet)}
    </p>
  );
}
