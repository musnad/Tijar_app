import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(
  join(dist, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tijar</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      html,body{margin:0;height:100%;background:#F3F5F8;color:#0B1F4D;font-family:system-ui,sans-serif}
      body{display:flex;align-items:center;justify-content:center}
      p{font-weight:800;letter-spacing:.04em}
    </style>
  </head>
  <body>
    <p>TIJAR</p>
  </body>
</html>
`,
);
console.log("Prepared Android splash assets. Capacitor loads the shop with the native bridge.");
