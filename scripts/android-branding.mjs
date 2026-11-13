import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = path.join(root, "public", "tijar-logo.png");
const res = path.join(root, "android", "app", "src", "main", "res");
const navy = { r: 0, g: 27, b: 58, alpha: 1 };
const paper = { r: 244, g: 247, b: 251, alpha: 1 };

const launchers = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];

const foregrounds = [
  ["mdpi", 108],
  ["hdpi", 162],
  ["xhdpi", 216],
  ["xxhdpi", 324],
  ["xxxhdpi", 432],
];

const splashes = [
  ["drawable", 480, 800],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 1080, 1920],
  ["drawable-port-xxxhdpi", 1440, 2560],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1920, 1080],
  ["drawable-land-xxxhdpi", 2560, 1440],
];

async function iconPng(size, round) {
  const pad = Math.round(size * 0.18);
  const inner = size - pad * 2;
  const logo = await sharp(logoPath)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const base = sharp({
    create: { width: size, height: size, channels: 4, background: navy },
  }).composite([{ input: logo, left: pad, top: pad }]);
  if (!round) return base.png().toBuffer();
  const r = Math.round(size / 2);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`,
  );
  return base.png().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function adaptiveForeground(size) {
  const pad = Math.round(size * 0.22);
  const inner = size - pad * 2;
  const logo = await sharp(logoPath)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toBuffer();
}

async function splashPng(width, height) {
  const mark = Math.round(Math.min(width, height) * 0.38);
  const logo = await sharp(logoPath)
    .resize(mark, mark, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width, height, channels: 4, background: paper },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

function writeWav(filePath) {
  const sampleRate = 22050;
  const duration = 0.72;
  const n = Math.floor(sampleRate * duration);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = t < 0.04 ? t / 0.04 : Math.max(0, 1 - (t - 0.04) / 0.68);
    const ding = Math.sin(2 * Math.PI * 1318.5 * t) * 0.35;
    const ding2 = Math.sin(2 * Math.PI * 1760 * t) * (t > 0.12 ? 0.28 : 0);
    const low = Math.sin(2 * Math.PI * 392 * t) * 0.18 * Math.exp(-t * 6);
    samples[i] = (ding + ding2 + low) * env;
  }
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(filePath, buf);
}

for (const [folder, size] of launchers) {
  const dir = path.join(res, `mipmap-${folder}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "ic_launcher.png"), await iconPng(size, false));
  writeFileSync(path.join(dir, "ic_launcher_round.png"), await iconPng(size, true));
}

for (const [folder, size] of foregrounds) {
  const dir = path.join(res, `mipmap-${folder}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "ic_launcher_foreground.png"), await adaptiveForeground(size));
}

for (const [folder, w, h] of splashes) {
  const dir = path.join(res, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "splash.png"), await splashPng(w, h));
}

const raw = path.join(res, "raw");
mkdirSync(raw, { recursive: true });
writeWav(path.join(raw, "sale.wav"));
mkdirSync(path.join(root, "public", "sounds"), { recursive: true });
writeWav(path.join(root, "public", "sounds", "sale.wav"));

console.log("Wrote Tijar launcher icons, splash screens, and sale sound.");
