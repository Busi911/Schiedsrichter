// Erzeugt die Produkttour-Screenshots (src/app/page.tsx, PRODUKTTOUR) aus
// einer laufenden Dev-Instanz mit Demo-Daten (siehe seed.ts) und legt sie
// direkt in public/produkttour ab. Siehe
// scripts/produkttour/README.md für den kompletten Ablauf.
import { chromium } from "playwright";
import sharp from "sharp";
import path from "node:path";
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
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#password-email", ADMIN_EMAIL);
await page.fill("#password", ADMIN_PASSWORT);
await page.getByRole("button", { name: "Einloggen" }).click();
await page.waitForURL("**/admin", { timeout: 15000 });
await page.waitForLoadState("networkidle");

async function fullShot(fileName) {
  await page.screenshot({ path: path.join(OUT_DIR, fileName) });
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
await page.mouse.wheel(0, 680);
await page.waitForTimeout(300);
await fullShot("_trainingsplan-full.png");

// 5. Offene Dienste
await page.goto(`${BASE}/admin/dienste`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await fullShot("_dienste-full.png");

await browser.close();

// Zuschneiden auf den relevanten Ausschnitt (kein leerer Seitenraum unten/
// rechts) — Werte an die tatsächliche Kartenhöhe der Demo-Daten angepasst,
// bei neuen Screenshots ggf. nachjustieren.
const CROPS = [
  { in: "_uebersicht-full.png", out: "uebersicht.png", crop: { left: 0, top: 0, width: 1440, height: 530 } },
  { in: "_funktionstraeger-full.png", out: "funktionstraeger.png", crop: { left: 0, top: 0, width: 1440, height: 830 } },
  { in: "_kalender-full.png", out: "kalender.png", crop: { left: 0, top: 0, width: 1440, height: 600 } },
  { in: "_trainingsplan-full.png", out: "trainingsplan.png", crop: { left: 0, top: 0, width: 1040, height: 800 } },
  { in: "_dienste-full.png", out: "dienste.png", crop: { left: 0, top: 0, width: 1440, height: 860 } },
];

for (const c of CROPS) {
  await sharp(path.join(OUT_DIR, c.in))
    .extract(c.crop)
    .png({ quality: 90 })
    .toFile(path.join(OUT_DIR, c.out));
  console.log("cropped", c.out);
  await unlink(path.join(OUT_DIR, c.in));
}
