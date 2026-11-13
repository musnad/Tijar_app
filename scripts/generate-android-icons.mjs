import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src =
  process.argv[2] ??
  "/Users/macbookpro/.cursor/projects/Users-macbookpro-Desktop-Tijar-app/assets/WhatsApp_Image_2026-11-10_at_3.22.01_PM__1_-eb2af197-c649-4b96-b216-441aabc930b3.jpg";

const res = path.join(root, "android/app/src/main/res");
const canvas = "#FFFFFF";
const splashBg = "#F3F5F8";

const launcher = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const foreground = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

const splash = {
  "drawable": [480, 480],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};

async function circleOnCanvas(size, fillRatio) {
  const inner = Math.round(size * fillRatio);
  const logo = await sharp(src)
    .resize(inner, inner, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: canvas },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png();
}

async function roundMask(size) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
    </svg>`,
  );
  const square = await circleOnCanvas(size, 0.96);
  return sharp(await square.toBuffer())
    .composite([{ input: svg, blend: "dest-in" }])
    .png();
}

for (const [folder, size] of Object.entries(launcher)) {
  const dir = path.join(res, folder);
  mkdirSync(dir, { recursive: true });
  await (await circleOnCanvas(size, 0.92)).toFile(path.join(dir, "ic_launcher.png"));
  await (await roundMask(size)).toFile(path.join(dir, "ic_launcher_round.png"));
}

for (const [folder, size] of Object.entries(foreground)) {
  const dir = path.join(res, folder);
  mkdirSync(dir, { recursive: true });
  // 66% Android safe zone so the circular ring is not clipped by the launcher mask.
  await (await circleOnCanvas(size, 0.66)).toFile(path.join(dir, "ic_launcher_foreground.png"));
}

for (const [folder, [w, h]] of Object.entries(splash)) {
  const dir = path.join(res, folder);
  mkdirSync(dir, { recursive: true });
  const mark = Math.round(Math.min(w, h) * 0.42);
  const logo = await sharp(src)
    .resize(mark, mark, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: w, height: h, channels: 4, background: splashBg },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(path.join(dir, "splash.png"));
}

const webLogo = path.join(root, "public", "tijar-logo.png");
await sharp(src).resize(1024, 1024, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(webLogo);

const store = path.join(root, "android", "tijar-play-icon-512.png");
await (await circleOnCanvas(512, 0.92)).toFile(store);

console.log("Wrote launcher, round, adaptive foreground, splash, and public/tijar-logo.png");
