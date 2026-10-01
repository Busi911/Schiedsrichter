import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const slug = process.env.SLUG || "tsf-heuchelheim";
const basis = `https://www.handballerpate.de/verein/${slug}`;
mkdirSync("out", { recursive: true });
const browser = await chromium.launch();
const seiten = ["", "/spiele", "/mannschaften"];
for (const [i, pfad] of seiten.entries()) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const res = await page.goto(basis + pfad, { waitUntil: "networkidle" });
  const name = pfad.replace("/", "") || "ergebnisse";
  const text = await page.innerText("body");
  console.log(`\n=== ${basis + pfad} → HTTP ${res?.status()} ===\n${text.slice(0, 3000)}`);
  writeFileSync(`out/${i}-${name}.txt`, text);
  await page.screenshot({ path: `out/${i}-${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
