import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const slug = process.env.SLUG || "tsf-heuchelheim";
const host = "https://www.handballerpate.de";
const basis = `${host}/verein/${slug}`;
mkdirSync("out", { recursive: true });
const browser = await chromium.launch();

const ansichten = [
  { name: "mobil", viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
  { name: "desktop", viewport: { width: 1280, height: 900 } },
];

for (const a of ansichten) {
  const ctx = await browser.newContext({ viewport: a.viewport, isMobile: a.isMobile, deviceScaleFactor: a.deviceScaleFactor });
  const page = await ctx.newPage();
  const foto = async (name, url, voll = true) => {
    try {
      const res = await page.goto(url, { waitUntil: "networkidle" });
      await page.screenshot({ path: `out/${a.name}-${name}.png`, fullPage: voll });
      console.log(`${a.name} ${name}: HTTP ${res?.status()} ${url}`);
      if (a.name === "mobil") writeFileSync(`out/${name}.txt`, await page.innerText("body"));
    } catch (e) {
      console.log(`${a.name} ${name}: FEHLER ${e.message}`);
    }
  };

  await foto("1-startseite-suche", `${host}/`, false);
  await foto("2-ergebnisse", basis);
  await foto("3-spiele", `${basis}/spiele`);
  await foto("4-mannschaften", `${basis}/mannschaften`);

  // erste Mannschaft öffnen (Detailseite)
  try {
    await page.goto(`${basis}/mannschaften`, { waitUntil: "networkidle" });
    const href = await page.locator(`a[href^="/verein/${slug}/"]:not([href$="/spiele"]):not([href$="/mannschaften"])`).first().getAttribute("href");
    if (href) {
      await foto("5-mannschaft", host + href);
      // als Favorit markieren, dann Favoriten-Ansicht
      const stern = page.getByRole("button", { name: /favorit/i }).first();
      if (await stern.count()) {
        await stern.click();
        await page.waitForTimeout(500);
        await foto("6-meine-favoriten", `${host}/meine`);
        await foto("7-ergebnisse-mit-favorit", basis, false);
      }
    }
  } catch (e) {
    console.log(`Mannschaftsdetail: FEHLER ${e.message}`);
  }
  await ctx.close();
}
await browser.close();
