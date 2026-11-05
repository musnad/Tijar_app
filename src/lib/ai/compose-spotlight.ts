import { loadImage } from "@/lib/marketing/resize-image";
import type { GraphicsFrame } from "@/lib/ai/seller-extract";

const NAVY = "#0A2540";
const GREEN = "#00B86B";

const TITLES: Record<GraphicsFrame, string> = {
  spotlight: "BUSINESS SPOTLIGHT",
  week: "BUSINESS OF THE WEEK",
  feature: "PRODUCT FEATURE",
};

export async function composeSpotlightFrame(input: {
  frame: GraphicsFrame;
  businessName: string;
  productName?: string | null;
  photoUrl: string;
  grokUrl?: string | null;
}): Promise<string> {
  const w = 900;
  const h = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw this poster.");

  if (input.grokUrl) {
    try {
      const bg = await loadImage(input.grokUrl);
      ctx.drawImage(bg, 0, 0, w, h);
    } catch {
      fillBrand(ctx, w, h);
    }
  } else {
    fillBrand(ctx, w, h);
  }

  ctx.fillStyle = "rgba(10,37,64,0.55)";
  ctx.fillRect(0, 0, w, 168);
  ctx.fillRect(0, h - 150, w, 150);

  ctx.fillStyle = GREEN;
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillText("TIJAR", 48, 52);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 36px system-ui, sans-serif";
  ctx.fillText(TITLES[input.frame], 48, 102);
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillText(input.businessName.slice(0, 36), 48, 140);

  const box = { x: 70, y: 200, w: w - 140, h: 720 };
  ctx.save();
  roundPath(ctx, box.x, box.y, box.w, box.h, 36);
  ctx.clip();
  try {
    const img = await loadImage(input.photoUrl);
    const scale = Math.max(box.w / img.width, box.h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
  } catch {
    ctx.fillStyle = "#123A5C";
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  ctx.restore();
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 8;
  roundPath(ctx, box.x, box.y, box.w, box.h, 36);
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 28px system-ui, sans-serif";
  const label = (input.productName || input.businessName).slice(0, 42);
  ctx.fillText(label, 48, h - 78);
  ctx.fillStyle = GREEN;
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText("Find this shop on TIJAR", 48, h - 42);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function fillBrand(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, NAVY);
  grad.addColorStop(1, "#06351F");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = GREEN;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(w - 40, 80, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
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
