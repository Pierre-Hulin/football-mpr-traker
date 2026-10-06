// Renders public/favicon.svg into the PNG icons referenced by the manifest.
// Usage: node scripts/generate-icons.mjs   (requires `npx playwright install chromium`)
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const targets = [
  { file: "icon-192.png", size: 192, pad: 0, bg: "transparent" },
  { file: "icon-512.png", size: 512, pad: 0, bg: "transparent" },
  { file: "apple-touch-icon.png", size: 180, pad: 0, bg: "#0b1f3a" },
  // Maskable: full-bleed background with the artwork inside the 80% safe zone.
  { file: "icon-maskable-512.png", size: 512, pad: 0.12, bg: "#0b1f3a" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - t.pad * 2));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg};display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px">` +
      svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `) +
      "</body></html>",
  );
  await page.screenshot({ path: `public/icons/${t.file}`, omitBackground: t.bg === "transparent" });
  console.log("wrote", t.file);
}
await browser.close();
