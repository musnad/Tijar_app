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

function drawBrandWash(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#061226");
  bg.addColorStop(0.55, NAVY);
  bg.addColorStop(1, "#0A2A1C");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const orbs = [
    { x: 160, y: 140, r: 240, c: "rgba(31,122,77,0.38)" },
    { x: w - 60, y: 280, r: 260, c: "rgba(201,162,39,0.16)" },
    { x: 90, y: h - 120, r: 220, c: "rgba(31,122,77,0.24)" },
  ];
  for (const o of orbs) {
    const g = ctx.createRadialGradient(o.x, o.y, 8, o.x, o.y, o.r);
    g.addColorStop(0, o.c);
    g.addColorStop(1, "rgba(6,18,38,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.font = "800 160px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TIJAR", 0, 40);
  ctx.restore();
}

async function drawTijarMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.stroke();
  try {
    const logo = await loadImage("/tijar-logo.png");
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } catch {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = GREEN;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 ${Math.round(r * 0.9)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("T", cx, cy + 2);
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

/** Branded TIJAR post card for WhatsApp status and groups. */
export async function composePostShareCard(input: PostShareCardInput): Promise<string> {
  const w = 1080;
  const h = 1620;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the post card.");

  drawBrandWash(ctx, w, h);

  const cardX = 56;
  const cardY = 56;
  const cardW = w - 112;
  const cardH = h - 112;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.42)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  fillRound(ctx, cardX, cardY, cardW, cardH, 40, PAPER);
  ctx.restore();

  ctx.save();
  roundPath(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.clip();

  const headerH = 236;
  const header = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH);
  header.addColorStop(0, NAVY);
  header.addColorStop(1, "#123A28");
  ctx.fillStyle = header;
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.fillStyle = GOLD;
  ctx.fillRect(cardX, cardY, cardW, 8);
  ctx.fillStyle = GREEN;
  ctx.fillRect(cardX, cardY + headerH - 8, cardW, 8);

  const cx = w / 2;
  await drawTijarMark(ctx, cx, cardY + 78, 44);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 44px system-ui, sans-serif";
  const word = "TIJAR";
  const track = 12;
  drawSpaced(ctx, word, cx - spacedWidth(ctx, word, track) / 2, cardY + 158, track);
  ctx.fillStyle = GOLD;
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText("tijar.ng", cx, cardY + 192);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText("INFORMAL MARKETPLACE  ·  NIGERIA", cx, cardY + 218);

  const shop = (input.shopName || "TIJAR").trim();
  const handle = `@${(input.handle || "tijar.ng").replace(/^@/, "")}`;
  const initial = (shop.slice(0, 1) || "T").toUpperCase();
  const shopY = cardY + headerH + 58;
  await drawCircleImage(ctx, cardX + 86, shopY, 34, input.avatarUrl, initial);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.font = "800 30px system-ui, sans-serif";
  ctx.fillText(shop.slice(0, 22), cardX + 138, shopY - 14);
  ctx.fillStyle = GREEN;
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText(`${handle.slice(0, 22)}  ·  on TIJAR`, cardX + 138, shopY + 18);

  const photoX = cardX + 36;
  const photoY = cardY + headerH + 110;
  const photoW = cardW - 72;
  const photoH = 720;
  await drawCover(ctx, photoX, photoY, photoW, photoH, 24, input.imageUrl);
  await drawTijarMark(ctx, photoX + 52, photoY + 52, 22);

  if (input.priceLabel) {
    ctx.font = "800 26px system-ui, sans-serif";
    const label = input.priceLabel;
    const tw = ctx.measureText(label).width;
    const px = photoX + 24;
    const py = photoY + photoH - 78;
    fillRound(ctx, px, py, tw + 44, 54, 16, NAVY);
    ctx.fillStyle = GOLD;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + 22, py + 28);
  }

  const textX = cardX + 48;
  const textW = cardW - 96;
  let y = photoY + photoH + 58;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = NAVY;
  ctx.font = "800 40px system-ui, sans-serif";
  wrapLines(ctx, (input.title || shop).slice(0, 72), textW, 2).forEach((line) => {
    ctx.fillText(line, textX, y);
    y += 48;
  });

  const body = (input.caption?.trim() || "").replace(/\s+/g, " ");
  if (body && body.toLowerCase() !== (input.title || "").toLowerCase()) {
    y += 6;
    ctx.fillStyle = MUTED;
    ctx.font = "500 24px system-ui, sans-serif";
    wrapLines(ctx, body.slice(0, 140), textW, 2).forEach((line) => {
      ctx.fillText(line, textX, y);
      y += 34;
    });
  }

  fillRound(ctx, cardX + 36, cardY + cardH - 108, cardW - 72, 72, 20, GREEN);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ORDER ON TIJAR.NG", cx, cardY + cardH - 72);

  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.93);
}
