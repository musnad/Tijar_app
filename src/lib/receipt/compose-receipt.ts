import { loadImage } from "@/lib/marketing/resize-image";

export type PaymentReceiptInput = {
  shopName: string;
  shopAddress?: string;
  orderRef: string;
  items: string;
  amountLabel: string;
  paidAt?: Date;
};

export function receiptShareCaption(input: PaymentReceiptInput): string {
  return [
    "TIJAR.ng payment receipt",
    input.shopName,
    input.shopAddress?.trim() || "",
    `Order ${input.orderRef}`,
    input.items,
    `Amount paid ${input.amountLabel}`,
    "Paid on tijar.ng",
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function roundPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  roundPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

function formatPaidWhen(date: Date): string {
  return date.toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Branded TIJAR.ng receipt card as a JPEG data URL. */
export async function composePaymentReceipt(input: PaymentReceiptInput): Promise<string> {
  const w = 1080;
  const h = 1480;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the receipt.");

  const navy = "#0B1F4D";
  const green = "#1F7A4D";
  const cream = "#F4F7FB";
  const paidAt = input.paidAt ?? new Date();

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, w, 280);

  ctx.fillStyle = green;
  ctx.fillRect(0, 280, w, 88);

  try {
    const logo = await loadImage("/tijar-logo.png");
    ctx.save();
    ctx.beginPath();
    ctx.arc(140, 132, 56, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, 84, 76, 112, 112);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(140, 132, 56, 0, Math.PI * 2);
    ctx.stroke();
  } catch {
    fillRound(ctx, 88, 80, 104, 104, 52, green);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.fillText("T", 124, 144);
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 54px system-ui, sans-serif";
  ctx.fillText("TIJAR", 230, 128);
  ctx.fillStyle = "#8CFFC4";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText("tijar.ng", 230, 172);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText("Informal marketplace", 230, 208);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 32px system-ui, sans-serif";
  ctx.fillText("PAYMENT RECEIPT", 64, 338);
  fillRound(ctx, 780, 298, 236, 52, 26, "#FFFFFF");
  ctx.fillStyle = green;
  ctx.font = "800 24px system-ui, sans-serif";
  ctx.fillText("PAID", 850, 334);

  fillRound(ctx, 48, 408, w - 96, 880, 36, "#FFFFFF");

  let y = 470;
  const label = (title: string) => {
    ctx.fillStyle = "#6B7280";
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(title.toUpperCase(), 92, y);
    y += 42;
  };
  const value = (text: string, size = 34, color = navy) => {
    ctx.fillStyle = color;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    const lines = wrapLines(ctx, text, w - 220);
    for (const line of lines) {
      ctx.fillText(line, 92, y);
      y += size + 10;
    }
    y += 18;
  };

  label("Shop");
  value(input.shopName, 40);
  if (input.shopAddress?.trim()) {
    ctx.fillStyle = "#374151";
    ctx.font = "600 26px system-ui, sans-serif";
    for (const line of wrapLines(ctx, input.shopAddress.trim(), w - 220)) {
      ctx.fillText(line, 92, y);
      y += 36;
    }
    y += 16;
  }

  label("Order");
  value(input.orderRef, 32);
  ctx.fillStyle = "#6B7280";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText(formatPaidWhen(paidAt), 92, y);
  y += 52;

  label("Order details");
  value(input.items || "Order", 28, "#111827");

  label("Amount paid");
  value(input.amountLabel, 48, green);

  ctx.fillStyle = navy;
  ctx.fillRect(0, h - 140, w, 140);
  ctx.fillStyle = "#8CFFC4";
  ctx.font = "800 28px system-ui, sans-serif";
  ctx.fillText("tijar.ng", 64, h - 78);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText("Show this receipt to the shop to confirm payment.", 64, h - 40);

  return canvas.toDataURL("image/jpeg", 0.92);
}
