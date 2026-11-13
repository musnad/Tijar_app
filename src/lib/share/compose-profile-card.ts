import { loadImage } from "@/lib/marketing/resize-image";

export type ProfileShareStyle = "navy" | "market" | "dusk";

export type ProfileShareCardInput = {
  name: string;
  handle: string;
  url: string;
  avatarUrl?: string | null;
  style?: ProfileShareStyle;
};

const STYLES: Record<ProfileShareStyle, { a: string; b: string; c: string }> = {
  navy: { a: "#071226", b: "#0B1F4D", c: "#1F7A4D" },
  market: { a: "#0A2A1C", b: "#145C3A", c: "#0B1F4D" },
  dusk: { a: "#101828", b: "#1B3A6B", c: "#C9A227" },
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

function drawStripes(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[]) {
  ctx.save();
  ctx.translate(w * 0.55, h * 0.08);
  ctx.rotate(-0.42);
  const band = 148;
  for (let i = -8; i < 18; i += 1) {
    ctx.fillStyle = colors[Math.abs(i) % colors.length]!;
    ctx.fillRect(-w, i * band, w * 3, band + 2);
  }
  ctx.restore();
}

function qrSrc(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=640x640&ecc=H&margin=8&color=0B1F4D&bgcolor=ffffff&data=${encodeURIComponent(url)}`;
}

async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  avatarUrl: string | null | undefined,
  name: string,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarUrl) {
    try {
      const img = await loadImage(avatarUrl);
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
  ctx.fillStyle = "#0B1F4D";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${Math.round(r)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((name.trim().slice(0, 1) || "T").toUpperCase(), cx, cy + 4);
  ctx.restore();
}

export function profileShareCaption(input: Pick<ProfileShareCardInput, "name" | "handle" | "url">): string {
  const handle = input.handle.replace(/^@/, "");
  return [`${input.name} on TIJAR`, `@${handle}`, "tijar.ng", input.url].join("\n");
}

/** TikTok-style branded TIJAR profile card for WhatsApp status and groups. */
export async function composeProfileShareCard(input: ProfileShareCardInput): Promise<string> {
  const w = 1080;
  const h = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the profile card.");

  const palette = STYLES[input.style ?? "navy"];
  ctx.fillStyle = palette.a;
  ctx.fillRect(0, 0, w, h);
  drawStripes(ctx, w, h, [palette.a, palette.b, palette.c, palette.b]);

  const cardW = 860;
  const cardH = 1180;
  const cardX = (w - cardW) / 2;
  const cardY = 430;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  fillRound(ctx, cardX, cardY, cardW, cardH, 56, "#FFFFFF");
  ctx.restore();

  await drawAvatar(ctx, w / 2, cardY, 118, input.avatarUrl, input.name);

  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  ctx.font = "800 52px system-ui, sans-serif";
  const name = input.name.trim().slice(0, 28) || "TIJAR";
  ctx.fillText(name, w / 2, cardY + 180);
  ctx.fillStyle = "#6B7280";
  ctx.font = "600 28px system-ui, sans-serif";
  const handle = `@${input.handle.replace(/^@/, "")}`;
  ctx.fillText(handle.slice(0, 28), w / 2, cardY + 228);

  const qrSize = 520;
  const qrX = (w - qrSize) / 2;
  const qrY = cardY + 280;
  try {
    const qr = await loadImage(qrSrc(input.url));
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  } catch {
    fillRound(ctx, qrX, qrY, qrSize, qrSize, 24, "#F3F4F6");
    ctx.fillStyle = "#0B1F4D";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillText("Scan on tijar.ng", w / 2, qrY + qrSize / 2);
  }

  try {
    const logo = await loadImage("/tijar-logo.png");
    const lr = 46;
    ctx.beginPath();
    ctx.arc(w / 2, qrY + qrSize / 2, lr + 8, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, qrY + qrSize / 2, lr, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, w / 2 - lr, qrY + qrSize / 2 - lr, lr * 2, lr * 2);
    ctx.restore();
  } catch {
    /* logo optional */
  }

  ctx.fillStyle = "#0B1F4D";
  ctx.font = "800 36px system-ui, sans-serif";
  ctx.fillText("TIJAR", w / 2, cardY + cardH - 88);
  ctx.fillStyle = "#1F7A4D";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText("tijar.ng", w / 2, cardY + cardH - 48);

  return canvas.toDataURL("image/jpeg", 0.92);
}
