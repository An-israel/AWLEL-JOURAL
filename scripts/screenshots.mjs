// Captures checkpoint screenshots at 360/768/1280/1536px.
// Usage: BASE_URL=http://localhost:3000 node scripts/screenshots.mjs <out-dir> [path ...]
// Set CHROMIUM_PATH to use a preinstalled Chromium.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [out = "screenshots", ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const routes = paths.length ? paths : ["/"];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
for (const route of routes) {
  const name = route === "/" ? "home" : route.replace(/^\//, "").replace(/[/?=&]+/g, "_");
  for (const width of [360, 768, 1280, 1536]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("console", (m) => m.type() === "error" && errors.push(`${route} @${width}: ${m.text()}`));
    await page.goto(base + route, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    if (route === "/" && width === 360) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/menu-360.png` });
    }
    if (route === "/" && width === 1280) {
      await page.getByRole("button", { name: "Search the journal" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/search-1280.png` });
    }
    await page.close();
  }
}
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
