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

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, limit: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
      if (lines.length >= limit) return lines;
    } else {
      line = test;
    }
  }
  if (line && lines.length < limit) lines.push(line);
  return lines;
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
  ctx.fillStyle = "#0B1F4D";
  ctx.fillRect(x, y, w, h);
  if (src) {
    try {
      const img = await loadImage(src);
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } catch {
      /* keep navy */
    }
  }
  ctx.restore();
}

async function drawLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
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
    ctx.fillStyle = "#0B1F4D";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("T", cx, cy + 1);
  }
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

/** Instagram-style branded TIJAR post card for WhatsApp status and groups. */
export async function composePostShareCard(input: PostShareCardInput): Promise<string> {
  const w = 1080;
  const h = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the post card.");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);

  const pad = 48;
  await drawLogo(ctx, pad + 36, 70, 36);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111827";
  ctx.font = "800 32px system-ui, sans-serif";
  ctx.fillText((input.shopName || "TIJAR").slice(0, 22), pad + 92, 58);
  ctx.fillStyle = "#6B7280";
  ctx.font = "600 22px system-ui, sans-serif";
  const handle = `@${(input.handle || "tijar.ng").replace(/^@/, "")}`;
  ctx.fillText(handle.slice(0, 28), pad + 92, 90);

  ctx.fillStyle = "#0B1F4D";
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("TIJAR", w - pad, 70);

  const photoY = 128;
  const photoH = 780;
  await drawCover(ctx, pad, photoY, w - pad * 2, photoH, 28, input.imageUrl);

  const bandY = photoY + photoH - 150;
  ctx.save();
  roundPath(ctx, pad + 28, bandY, w - pad * 2 - 56, 118, 22);
  ctx.fillStyle = "rgba(11,31,77,0.92)";
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 36px system-ui, sans-serif";
  const nameLines = wrapLines(ctx, input.title.slice(0, 80) || "On TIJAR", w - pad * 2 - 100, 1);
  ctx.fillText(nameLines[0] ?? "On TIJAR", pad + 52, bandY + (input.priceLabel ? 42 : 60));
  if (input.priceLabel) {
    ctx.fillStyle = "#C8F5D8";
    ctx.font = "800 30px system-ui, sans-serif";
    ctx.fillText(input.priceLabel, pad + 52, bandY + 86);
  }

  const bodyY = photoY + photoH + 40;
  ctx.fillStyle = "#111827";
  ctx.font = "600 26px system-ui, sans-serif";
  const caption = wrapLines(
    ctx,
    (input.caption?.trim() || `${input.shopName} on TIJAR`).slice(0, 180),
    w - pad * 2,
    2,
  );
  caption.forEach((line, i) => ctx.fillText(line, pad, bodyY + i * 34));

  fillRound(ctx, pad, h - 118, w - pad * 2, 70, 20, "#1F7A4D");
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(input.cta ?? "Tap the link to order on tijar.ng", w / 2, h - 80);

  return canvas.toDataURL("image/jpeg", 0.92);
}
