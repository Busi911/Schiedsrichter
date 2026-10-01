// Einmal-Sonde: öffnet handball.net für einen Verein (Standard: TSF
// Heuchelheim), protokolliert alle /api/new/-Aufrufe der Seite und speichert
// Screenshots. Zweck: die API-Pfade für Teamliste, Spielplan und Tabelle
// herausfinden, die sich aus dem HTML allein nicht ergeben.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const SUCHE = process.env.VEREIN ?? "Heuchelheim";
const BASIS = "https://www.handball.net";
mkdirSync("out", { recursive: true });
const api = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1280, height: 1800 } });
const page = await ctx.newPage();
page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/api/")) return;
  let body = "";
  try {
    body = (await r.text()).slice(0, 400).replace(/\s+/g, " ");
  } catch {}
  api.push({ status: r.status(), url: u, body });
  console.log(`API ${r.status()} ${u}\n    ${body.slice(0, 200)}`);
});

async function offen(url, name) {
  console.log(`\n=== ${name}: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Cookie-Banner (Consentmanager) wegklicken, falls vorhanden
  for (const t of ["Alle akzeptieren", "Akzeptieren", "Zustimmen", "Alle zulassen"]) {
    const b = page.getByRole("button", { name: new RegExp(t, "i") }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      break;
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `out/${name}.png`, fullPage: true });
  console.log(`Titel: ${await page.title()}`);
}

const links = async (muster) =>
  page.$$eval(`a[href*="${muster}"]`, (as) =>
    [...new Map(as.map((a) => [a.href, (a.textContent ?? "").trim().replace(/\s+/g, " ")])).entries()]
  );

// 1. Verein suchen
await offen(`${BASIS}/buscar/${encodeURIComponent(SUCHE)}`, "01-suche");
let vereine = await links("/club/");
console.log("Vereinslinks:", JSON.stringify(vereine.slice(0, 15)));
if (vereine.length === 0) {
  await offen(`${BASIS}/spielbetrieb/vereine`, "01b-vereine");
  const feld = page.locator('input[type="search"], input[placeholder*="uch" i], input[type="text"]').first();
  await feld.fill(SUCHE).catch(() => console.log("kein Suchfeld gefunden"));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "out/01c-vereine-suche.png", fullPage: true });
  vereine = await links("/club/");
  console.log("Vereinslinks (Vereinsliste):", JSON.stringify(vereine.slice(0, 15)));
}
const treffer = vereine.find(([, t]) => /heuchelheim/i.test(t)) ?? vereine[0];
if (!treffer) {
  console.log("KEIN VEREIN GEFUNDEN");
  writeFileSync("out/api.json", JSON.stringify(api, null, 1));
  await browser.close();
  process.exit(0);
}
const clubUrl = treffer[0];
const clubId = clubUrl.split("/club/")[1].split(/[/?#]/)[0];
console.log(`\nGewählt: ${treffer[1]} → ${clubUrl} (ID ${clubId})`);

// 2. Vereinsseite (Teams-Tab lädt die Mannschaften nach)
await offen(clubUrl, "02-verein");
const teams = await links("/team/");
console.log("Teamlinks:", JSON.stringify(teams.slice(0, 30)));

// 3. Direkte Abfragen mit Origin/Referer (wie die Anwendung sie später stellt)
const kandidaten = [
  `/api/new/teams?club_id=${clubId}`,
  `/api/new/teams?club_id=${clubId}&season_id=2627`,
  `/api/new/teams/clubs/${clubId}/teams`,
  `/api/new/teams/clubs/${clubId}/teams?season_id=2627`,
  `/api/new/clubs/${clubId}/teams`,
  `/api/new/clubs/${clubId}`,
];
for (const pfad of kandidaten) {
  const r = await ctx.request
    .get(BASIS + pfad, { headers: { Origin: BASIS, Referer: `${BASIS}/club/${clubId}`, Accept: "application/json" } })
    .catch((e) => ({ status: () => 0, text: async () => String(e) }));
  console.log(`\nKANDIDAT ${r.status()} ${pfad}\n    ${(await r.text()).slice(0, 300).replace(/\s+/g, " ")}`);
}

// 4. Erste Mannschaft: Seite, Tabelle, Spielplan
const team = teams[0]?.[0];
if (team) {
  await offen(team, "03-team");
  for (const tab of ["TABELLE", "SPIELPLAN", "STATISTIKEN"]) {
    const b = page.getByRole("tab", { name: new RegExp(tab, "i") }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `out/04-${tab.toLowerCase()}.png`, fullPage: true });
      console.log(`Tab ${tab} geöffnet`);
    } else {
      console.log(`Tab ${tab} nicht gefunden`);
    }
  }
}

writeFileSync("out/api.json", JSON.stringify(api, null, 1));
console.log(`\n${api.length} API-Antworten protokolliert`);
await browser.close();
