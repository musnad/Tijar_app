import { loadImage } from "@/lib/marketing/resize-image";
import { pickVideoRecorderMime } from "@/lib/video/file-guard";

export async function composeAdvertClip(input: {
  photoUrl: string;
  voiceBlob?: Blob | null;
  durationSec: number;
  headline: string;
  bgLevel: number;
  withVoice: boolean;
}): Promise<Blob> {
  const duration = Math.min(15, Math.max(3, input.durationSec));
  const img = await loadImage(input.photoUrl);
  const w = 540;
  const h = 960;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the advert.");

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const bgGain = audioCtx.createGain();
  bgGain.gain.value = Math.min(0.22, Math.max(0, input.bgLevel));
  startCutePad(audioCtx, bgGain);
  bgGain.connect(dest);
  bgGain.connect(audioCtx.destination);

  if (input.voiceBlob && input.withVoice) {
    const buf = await audioCtx.decodeAudioData(await input.voiceBlob.arrayBuffer());
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const voiceGain = audioCtx.createGain();
    voiceGain.gain.value = 1;
    src.connect(voiceGain);
    voiceGain.connect(dest);
    voiceGain.connect(audioCtx.destination);
    src.start(0);
  }

  const canvasStream = canvas.captureStream(16);
  const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  await audioCtx.resume().catch(() => undefined);
  const mime = pickVideoRecorderMime();
  const rec = mime ? new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 1_200_000 }) : new MediaRecorder(mixed);
  const chunks: Blob[] = [];
  rec.ondataavailable = (ev) => {
    if (ev.data.size) chunks.push(ev.data);
  };

  const started = performance.now();
  const draw = () => {
    const t = (performance.now() - started) / 1000;
    const zoom = 1.08 + 0.12 * (t / duration);
    paintFrame(ctx, img, w, h, zoom, input.headline, t);
  };
  const loop = window.setInterval(draw, 1000 / 16);
  draw();
  rec.start(200);

  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, duration * 1000);
    rec.onstop = () => resolve();
  });
  window.clearInterval(loop);
  await audioCtx.close().catch(() => undefined);

  return new Blob(chunks, { type: rec.mimeType || "video/webm" });
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  zoom: number,
  headline: string,
  t: number,
) {
  ctx.fillStyle = "#0B1F4D";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 - 20, dw, dh);
  ctx.globalAlpha = 1;
  const overlay = ctx.createLinearGradient(0, h * 0.45, 0, h);
  overlay.addColorStop(0, "rgba(11,31,77,0)");
  overlay.addColorStop(1, "rgba(11,31,77,0.88)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#1F7A4D";
  ctx.beginPath();
  ctx.arc(48 + Math.sin(t * 2) * 4, 56, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("TIJAR", 64, 62);

  ctx.font = "800 28px system-ui, sans-serif";
  wrap(ctx, headline.slice(0, 90), 28, h - 140, w - 56, 32);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

export function startCutePad(ctx: AudioContext, out: GainNode) {
  const notes = [261.63, 329.63, 392.0, 523.25];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.value = 0.04 + i * 0.01;
    osc.connect(g);
    g.connect(out);
    osc.start();
  });
}
