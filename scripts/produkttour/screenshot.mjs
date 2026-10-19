// Erzeugt die Produkttour-Screenshots (src/app/page.tsx, PRODUKTTOUR) aus
// einer laufenden Dev-Instanz mit Demo-Daten (siehe seed.ts) und legt sie
// direkt in public/produkttour ab. Siehe
// scripts/produkttour/README.md für den kompletten Ablauf.
import { chromium } from "playwright";
import sharp from "sharp";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { unlink } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../../public/produkttour");
const BASE = process.env.PRODUKTTOUR_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = "admin@demo.handballerpate.de";
const ADMIN_PASSWORT = "Demo-Passwort-1!";

// PRODUKTTOUR_CHROMIUM_PATH ist nur für Sandboxes mit vorinstalliertem
// Chromium an einem nicht-standardmäßigen Pfad gedacht (z.B. diese
// Entwicklungsumgebung) — im normalen CI-Workflow und lokal reicht
// `npx playwright install chromium`, dann bleibt die Variable ungesetzt und
// Playwright nutzt seinen eigenen Browser-Download.
const browser = await chromium.launch({
  executablePath: process.env.PRODUKTTOUR_CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Der Demo-Verein hat keinen angebundenen Spielplan: ohne dieses Cookie leitet /admin in den Einrichtungs-Assistenten statt auf das Dashboard.
await context.addCookies([{ name: "hp_einrichtung_uebersprungen", value: "1", url: BASE }]);
const page = await context.newPage();
// Entwicklungs-Plakette von Next.js (unten links) gehört nicht ins Bild.
await page.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.head.appendChild(style);
  });
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", ADMIN_EMAIL);
await page.fill("#password", ADMIN_PASSWORT);
await page.getByRole("button", { name: "Einloggen" }).click();
await page.waitForURL("**/admin", { timeout: 15000 });
await page.waitForLoadState("networkidle");

async function fullShot(fileName) {
  await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: true });
}

// 1. Übersicht
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await fullShot("_uebersicht-full.png");

// 2. Funktionsträger
await page.goto(`${BASE}/admin/funktionstraeger`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await fullShot("_funktionstraeger-full.png");

// 3. Kalender — einen Monat weiter, wo die Demo-Termine liegen
await page.goto(`${BASE}/admin/kalender`, { waitUntil: "networkidle" });
await page.click('a:has-text("Nächster Monat")');
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);
await fullShot("_kalender-full.png");

// 4. Trainingsplan — leicht gescrollt, damit Wochentage UND Trainingsblöcke
// im sichtbaren Bereich liegen (Grid startet oberhalb des Folds).
await page.goto(`${BASE}/admin/trainingsplan`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await fullShot("_trainingsplan-full.png");

// 5. Offene Dienste
await page.goto(`${BASE}/admin/dienste`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await fullShot("_dienste-full.png");

await browser.close();

// Ganze Seite, kein Zuschnitt: Dateien umbenennen und die Bildmaße für die Startseite ablegen (public/produkttour/masse.json, von src/app/page.tsx gelesen).
const NAMEN = ["uebersicht", "funktionstraeger", "kalender", "trainingsplan", "dienste"];
const masse = {};
for (const name of NAMEN) {
  const ziel = path.join(OUT_DIR, `${name}.png`);
  await sharp(path.join(OUT_DIR, `_${name}-full.png`)).png({ quality: 90 }).toFile(ziel);
  const meta = await sharp(ziel).metadata();
  masse[name] = { breite: meta.width, hoehe: meta.height };
  await unlink(path.join(OUT_DIR, `_${name}-full.png`));
  console.log("saved", name, masse[name]);
}
await writeFile(path.join(OUT_DIR, "masse.json"), JSON.stringify(masse, null, 2) + "\n");
