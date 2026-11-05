import { studioCta } from "@/lib/marketing/draft-content";
import { loadImage } from "@/lib/marketing/resize-image";
import type { Locale } from "@/lib/i18n/types";

export async function composeCuteFlyer(input: {
  prompt: string;
  productName: string;
  businessName: string;
  priceLabel?: string | null;
  photoUrl?: string | null;
  locale?: Locale;
}): Promise<string> {
  const w = 900;
  const h = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the flyer.");

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0B1F4D");
  grad.addColorStop(0.55, "#145C3A");
  grad.addColorStop(1, "#1F7A4D");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  drawSpark(ctx, 70, 90, 18);
  drawSpark(ctx, 820, 140, 14);
  drawSpark(ctx, 80, 1080, 12);
  drawSpark(ctx, 840, 1020, 16);

  roundRect(ctx, 48, 160, w - 96, h - 280, 36, "#FFFFFF");

  const locale = input.locale ?? "en";
  const rtl = locale === "ar";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  const textX = rtl ? w - 90 : 80;

  ctx.fillStyle = "#1F7A4D";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText("TIJAR · AI Marketing Studio", textX, 80);
  ctx.fillStyle = "#E8F5EE";
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText(input.businessName.slice(0, 36), textX, 112);

  if (input.photoUrl) {
    try {
      const img = await loadImage(input.photoUrl);
      const box = { x: 110, y: 210, w: w - 220, h: 420 };
      ctx.save();
      roundPath(ctx, box.x, box.y, box.w, box.h, 28);
      ctx.clip();
      const scale = Math.max(box.w / img.width, box.h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
      ctx.restore();
    } catch {
      /* no photo */
    }
  }

  const copyX = rtl ? w - 90 : 90;
  ctx.fillStyle = "#0B1F4D";
  ctx.font = "800 44px system-ui, sans-serif";
  wrapText(ctx, input.productName.slice(0, 48), copyX, input.photoUrl ? 700 : 280, w - 180, 52, rtl);

  ctx.fillStyle = "#1F7A4D";
  ctx.font = "700 28px system-ui, sans-serif";
  wrapText(ctx, input.prompt.slice(0, 180), copyX, input.photoUrl ? 820 : 420, w - 180, 36, rtl);

  if (input.priceLabel) {
    ctx.fillStyle = "#1F7A4D";
    ctx.font = "800 40px system-ui, sans-serif";
    ctx.fillText(input.priceLabel, copyX, 1080);
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText(studioCta(locale), copyX, 1160);

  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Stamp TIJAR navy/green bars on a Grok design so the For You post is clearly ours. */
export async function stampTijarFlyer(input: {
  grokUrl: string;
  productName: string;
  businessName: string;
  priceLabel?: string | null;
  locale?: Locale;
}): Promise<string> {
  const w = 900;
  const h = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return input.grokUrl;

  ctx.fillStyle = "#0B1F4D";
  ctx.fillRect(0, 0, w, h);
  try {
    const img = await loadImage(input.grokUrl);
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } catch {
    return input.grokUrl;
  }

  const top = ctx.createLinearGradient(0, 0, 0, 140);
  top.addColorStop(0, "rgba(11,31,77,0.92)");
  top.addColorStop(1, "rgba(11,31,77,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, 160);

  const bot = ctx.createLinearGradient(0, h - 220, 0, h);
  bot.addColorStop(0, "rgba(11,31,77,0)");
  bot.addColorStop(1, "rgba(11,31,77,0.94)");
  ctx.fillStyle = bot;
  ctx.fillRect(0, h - 240, w, 240);

  ctx.fillStyle = "#1F7A4D";
  ctx.font = "800 20px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("TIJAR", 36, 48);
  ctx.fillStyle = "#E8F5EE";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText(input.businessName.slice(0, 36), 110, 48);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 36px system-ui, sans-serif";
  wrapText(ctx, input.productName.slice(0, 48), 36, 1020, w - 72, 42);

  if (input.priceLabel) {
    ctx.fillStyle = "#00B86B";
    ctx.font = "800 32px system-ui, sans-serif";
    ctx.fillText(input.priceLabel, 36, 1110);
  }

  ctx.fillStyle = "#E8F5EE";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText(studioCta(input.locale ?? "en"), 36, 1160);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
}

function roundRect(
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

function roundPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  rtl = false,
) {
  ctx.textAlign = rtl ? "right" : "left";
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
