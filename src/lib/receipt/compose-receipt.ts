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

const NAVY = "#07152F";
const INK = "#0B1F4D";
const GREEN = "#1F7A4D";
const MINT = "#C8F5D8";
const GOLD = "#E8C98A";
const PAPER = "#FFFcf7";

function roundPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) {
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
  return lines.slice(0, 5);
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

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + tracking;
  return Math.max(0, w - tracking);
}

function dashedRule(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 9]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.font = "800 180px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TIJAR", 0, 40);
  ctx.restore();
}

function drawGlowOrbs(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const orbs = [
    { x: 180, y: 160, r: 220, c: "rgba(31,122,77,0.45)" },
    { x: w - 80, y: 320, r: 260, c: "rgba(232,201,138,0.18)" },
    { x: 120, y: h - 180, r: 240, c: "rgba(31,122,77,0.28)" },
  ];
  for (const o of orbs) {
    const g = ctx.createRadialGradient(o.x, o.y, 10, o.x, o.y, o.r);
    g.addColorStop(0, o.c);
    g.addColorStop(1, "rgba(7,21,47,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPaidSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.28);
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(31,122,77,0.12)";
  ctx.fill();
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 66, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = GREEN;
  ctx.font = "800 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PAID", 0, 8);
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillStyle = INK;
  ctx.fillText("TIJAR.NG", 0, 30);
  ctx.restore();
}

/** Branded TIJAR.ng receipt card as a JPEG data URL. */
export async function composePaymentReceipt(input: PaymentReceiptInput): Promise<string> {
  const w = 1080;
  const h = 1680;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the receipt.");

  const paidAt = input.paidAt ?? new Date();
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#061226");
  bg.addColorStop(0.45, NAVY);
  bg.addColorStop(1, "#0A2A1C");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  drawGlowOrbs(ctx, w, h);
  drawWatermark(ctx, w, h);

  const cardX = 64;
  const cardY = 88;
  const cardW = w - 128;
  const cardH = h - 176;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  fillRound(ctx, cardX, cardY, cardW, cardH, 40, PAPER);
  ctx.restore();

  ctx.save();
  roundPath(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.clip();

  const header = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + 290);
  header.addColorStop(0, INK);
  header.addColorStop(1, "#123A28");
  ctx.fillStyle = header;
  ctx.fillRect(cardX, cardY, cardW, 292);

  ctx.fillStyle = GOLD;
  ctx.fillRect(cardX, cardY, cardW, 6);
  ctx.fillStyle = GREEN;
  ctx.fillRect(cardX, cardY + 286, cardW, 6);

  const cx = w / 2;
  try {
    const logo = await loadImage("/tijar-logo.png");
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cardY + 108, 52, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.clip();
    ctx.drawImage(logo, cx - 52, cardY + 56, 104, 104);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cardY + 108, 56, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.stroke();
  } catch {
    fillRound(ctx, cx - 52, cardY + 56, 104, 104, 52, GREEN);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 36px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("T", cx, cardY + 118);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 46px system-ui, sans-serif";
  const word = "TIJAR";
  const track = 14;
  const wordW = spacedWidth(ctx, word, track);
  drawSpaced(ctx, word, cx - wordW / 2, cardY + 198, track);

  ctx.fillStyle = GOLD;
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText("tijar.ng", cx, cardY + 236);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText("INFORMAL MARKETPLACE  ·  NIGERIA", cx, cardY + 266);

  ctx.textAlign = "left";
  let y = cardY + 360;
  const left = cardX + 64;
  const maxW = cardW - 128;

  ctx.fillStyle = GREEN;
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.fillText("PAYMENT RECEIPT", left, y);
  y += 18;
  dashedRule(ctx, left, y, maxW, "rgba(11,31,77,0.18)");
  y += 48;

  ctx.fillStyle = "#8A7A5A";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText("PAID TO", left, y);
  y += 42;
  ctx.fillStyle = INK;
  ctx.font = "700 44px Georgia, 'Times New Roman', serif";
  for (const line of wrapLines(ctx, input.shopName, maxW - 40)) {
    ctx.fillText(line, left, y);
    y += 52;
  }
  if (input.shopAddress?.trim()) {
    ctx.fillStyle = "#4B5563";
    ctx.font = "500 24px system-ui, sans-serif";
    for (const line of wrapLines(ctx, input.shopAddress.trim(), maxW)) {
      ctx.fillText(line, left, y);
      y += 34;
    }
  }

  y += 28;
  dashedRule(ctx, left, y, maxW, "rgba(11,31,77,0.16)");
  y += 48;

  const col2 = left + maxW / 2;
  ctx.fillStyle = "#8A7A5A";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText("ORDER", left, y);
  ctx.fillText("DATE", col2, y);
  y += 36;
  ctx.fillStyle = INK;
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText(input.orderRef, left, y);
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillStyle = "#374151";
  const when = formatPaidWhen(paidAt);
  for (const line of wrapLines(ctx, when, maxW / 2 - 16)) {
    ctx.fillText(line, col2, y);
    y += 30;
  }
  y += 20;

  ctx.fillStyle = "#8A7A5A";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText("ORDER DETAILS", left, y);
  y += 38;
  ctx.fillStyle = "#111827";
  ctx.font = "600 26px system-ui, sans-serif";
  for (const line of wrapLines(ctx, input.items || "Order", maxW - 160)) {
    ctx.fillText(line, left, y);
    y += 36;
  }

  y += 36;
  fillRound(ctx, left, y, maxW, 168, 28, "#F3FBF6");
  ctx.strokeStyle = "rgba(31,122,77,0.22)";
  ctx.lineWidth = 2;
  roundPath(ctx, left, y, maxW, 168, 28);
  ctx.stroke();

  ctx.fillStyle = "#8A7A5A";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText("AMOUNT PAID", left + 36, y + 48);
  ctx.fillStyle = GREEN;
  ctx.font = "800 52px system-ui, sans-serif";
  ctx.fillText(input.amountLabel, left + 36, y + 116);
  ctx.fillStyle = INK;
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText("Confirmed on tijar.ng", left + 36, y + 148);

  drawPaidSeal(ctx, left + maxW - 92, y + 84);

  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText("tijar.ng", w / 2, h - 48);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillText("Keep this receipt · share it with the shop on WhatsApp", w / 2, h - 24);

  return canvas.toDataURL("image/jpeg", 0.94);
}
