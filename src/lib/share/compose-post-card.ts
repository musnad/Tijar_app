import { loadImage } from "@/lib/marketing/resize-image";

export type PostShareCardInput = {
  title: string;
  shopName: string;
  handle?: string;
  caption?: string;
  url: string;
  imageUrl?: string | null;
  avatarUrl?: string | null;
  priceLabel?: string | null;
  cta?: string;
};

const NAVY = "#0B1F4D";
const GREEN = "#1F7A4D";
const GOLD = "#C9A227";
const INK = "#16181D";
const MUTED = "#6B7280";
const PAPER = "#FFFcf8";

function roundPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
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

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, limit: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
      if (lines.length >= limit) {
        if (ctx.measureText(`${line}…`).width > maxW) line = `${line.slice(0, Math.max(1, line.length - 2))}…`;
        else line = `${line}…`;
        lines[limit - 1] = line;
        return lines.slice(0, limit);
      }
    } else {
      line = test;
    }
  }
  if (line && lines.length < limit) lines.push(line);
  return lines;
}

function hairline(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();
  ctx.restore();
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

async function drawCover(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  src: string | null | undefined,
) {
  ctx.save();
  roundPath(ctx, x, y, w, h, r);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#102445");
  g.addColorStop(1, "#145C3A");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (src) {
    try {
      const img = await loadImage(src);
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } catch {
      /* keep gradient */
    }
  }
  const veil = ctx.createLinearGradient(x, y + h * 0.72, x, y + h);
  veil.addColorStop(0, "rgba(11,31,77,0)");
  veil.addColorStop(1, "rgba(11,31,77,0.28)");
  ctx.fillStyle = veil;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

async function drawCircleImage(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  src: string | null | undefined,
  fallback: string,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (src) {
    try {
      const img = await loadImage(src);
      const size = r * 2;
      const scale = Math.max(size / img.width, size / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
      return;
    } catch {
      /* fallback */
    }
  }
  ctx.fillStyle = NAVY;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${Math.round(r)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fallback, cx, cy + 2);
  ctx.restore();
}

export function postShareCaption(input: PostShareCardInput): string {
  const handle = (input.handle ?? "").replace(/^@/, "");
  return [
    input.title,
    input.shopName ? `${input.shopName} on TIJAR` : "TIJAR",
    handle ? `@${handle}` : "",
    input.priceLabel ?? "",
    input.caption?.trim() ?? "",
    input.cta ?? "Tap to order on tijar.ng",
    input.url,
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** Standard editorial TIJAR post card for WhatsApp status and groups. */
export async function composePostShareCard(input: PostShareCardInput): Promise<string> {
  const w = 1080;
  const h = 1440;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the post card.");

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#F3EFE6");
  bg.addColorStop(1, "#E7E1D4");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cardX = 48;
  const cardY = 48;
  const cardW = w - 96;
  const cardH = h - 96;
  ctx.save();
  ctx.shadowColor = "rgba(22, 24, 29, 0.18)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  fillRound(ctx, cardX, cardY, cardW, cardH, 36, PAPER);
  ctx.restore();

  ctx.save();
  roundPath(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.clip();
  ctx.fillStyle = GOLD;
  ctx.fillRect(cardX, cardY, cardW, 7);

  const shop = (input.shopName || "TIJAR").trim();
  const handle = `@${(input.handle || "tijar.ng").replace(/^@/, "")}`;
  const initial = (shop.slice(0, 1) || "T").toUpperCase();
  const headerY = cardY + 86;
  await drawCircleImage(ctx, cardX + 78, headerY, 36, input.avatarUrl, initial);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(shop.slice(0, 22), cardX + 132, headerY - 14);
  ctx.fillStyle = MUTED;
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText(handle.slice(0, 26), cardX + 132, headerY + 18);

  try {
    const logo = await loadImage("/tijar-logo.png");
    const lr = 28;
    const lx = cardX + cardW - 72;
    ctx.beginPath();
    ctx.arc(lx, headerY, lr + 3, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, headerY, lr, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, lx - lr, headerY - lr, lr * 2, lr * 2);
    ctx.restore();
  } catch {
    ctx.fillStyle = NAVY;
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("TIJAR", cardX + cardW - 40, headerY);
  }

  hairline(ctx, cardX + 40, cardY + 142, cardW - 80, "rgba(201,162,39,0.45)");

  const photoX = cardX + 40;
  const photoY = cardY + 164;
  const photoW = cardW - 80;
  const photoH = 780;
  await drawCover(ctx, photoX, photoY, photoW, photoH, 22, input.imageUrl);

  if (input.priceLabel) {
    ctx.font = "700 24px system-ui, sans-serif";
    const label = input.priceLabel;
    const tw = ctx.measureText(label).width;
    const px = photoX + photoW - tw - 56;
    const py = photoY + photoH - 78;
    fillRound(ctx, px, py, tw + 36, 50, 25, "rgba(255,252,248,0.94)");
    ctx.fillStyle = GREEN;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + 18, py + 26);
  }

  const textX = cardX + 48;
  const textW = cardW - 96;
  let y = photoY + photoH + 56;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = NAVY;
  ctx.font = "800 40px system-ui, sans-serif";
  const titles = wrapLines(ctx, (input.title || shop).slice(0, 72), textW, 2);
  titles.forEach((line) => {
    ctx.fillText(line, textX, y);
    y += 48;
  });

  const body = (input.caption?.trim() || "").replace(/\s+/g, " ");
  if (body && body.toLowerCase() !== (input.title || "").toLowerCase()) {
    y += 8;
    ctx.fillStyle = MUTED;
    ctx.font = "500 24px system-ui, sans-serif";
    wrapLines(ctx, body.slice(0, 160), textW, 2).forEach((line) => {
      ctx.fillText(line, textX, y);
      y += 34;
    });
  }

  hairline(ctx, textX, cardY + cardH - 92, textW, "rgba(201,162,39,0.5)");
  ctx.textAlign = "center";
  ctx.fillStyle = NAVY;
  ctx.font = "800 22px system-ui, sans-serif";
  const mark = "TIJAR";
  const track = 10;
  let markW = 0;
  for (const ch of mark) markW += ctx.measureText(ch).width + track;
  drawSpaced(ctx, mark, w / 2 - (markW - track) / 2, cardY + cardH - 52, track);
  ctx.fillStyle = GOLD;
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText(input.cta ?? "Tap the link to order  ·  tijar.ng", w / 2, cardY + cardH - 22);

  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.93);
}
