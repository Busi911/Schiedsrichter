// Tests des sport.de-Syncs: reine Funktionen (Fälligkeit, Kennzahlen, Felder) und — mit TEST_DATABASE_ADMIN_URL — der Sync gegen ein echtes
// Postgres. HTTP ist durch erzeugte Spieltagsseiten ersetzt (nachgebaute Struktur, siehe __fixtures__/README.md).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { verknuepfeSportDeTeam } from "../identitaet";
import { normalizeSportDeMatch } from "../normalisierung";
import { parseSpieltagSeite } from "./schedule-parser";
import { berechneRundenMeta, ligaStatus, rundeFaellig, sportDeSpielFelder, synchronisiereSportDe, wartezeitNachFehler } from "./sync";

const SPIELTAG10 = readFileSync(path.join(__dirname, "__fixtures__", "spieltag-hbl2.html"), "utf8");
const jetzt = new Date("2025-10-04T15:00:00Z");

describe("sport.de: Fälligkeit der Spieltagsseiten", () => {
  const meta = (extra: Partial<ReturnType<typeof berechneRundenMeta>> = {}) => ({ erstes: "2025-10-04", letztes: "2025-10-05", begonnen: 0, beendet: 0, gesamt: 9, ...extra });
  const vor = (min: number) => new Date(jetzt.getTime() - min * 60_000);
  it("nie geholt = fällig (Erstimport)", () => {
    expect(rundeFaellig(undefined, jetzt, false)).toBe("nie");
    expect(rundeFaellig({ letzterErfolgAm: null, meta: null }, jetzt, false)).toBe("nie");
  });
  it("Spieltag steht an oder läuft: alle 10 Minuten", () => {
    expect(rundeFaellig({ letzterErfolgAm: vor(5), meta: meta({ begonnen: 3, beendet: 1 }) }, jetzt, false)).toBeNull();
    expect(rundeFaellig({ letzterErfolgAm: vor(11), meta: meta({ begonnen: 3, beendet: 1 }) }, jetzt, false)).toBe("heiss");
    expect(rundeFaellig({ letzterErfolgAm: vor(11), meta: meta() }, jetzt, false)).toBe("heiss"); // heute angesetzt
  });
  it("weit entfernte Spieltage selten, abgeschlossene fast nie", () => {
    const fern = meta({ erstes: "2026-02-01", letztes: "2026-02-02" });
    expect(rundeFaellig({ letzterErfolgAm: vor(120), meta: fern }, jetzt, false)).toBeNull();
    expect(rundeFaellig({ letzterErfolgAm: vor(7 * 60), meta: fern }, jetzt, false)).toBe("offen");
    const fertig = meta({ erstes: "2025-09-01", letztes: "2025-09-02", begonnen: 9, beendet: 9 });
    expect(rundeFaellig({ letzterErfolgAm: vor(60 * 24), meta: fertig }, jetzt, false)).toBeNull();
    expect(rundeFaellig({ letzterErfolgAm: vor(60 * 24 * 8), meta: fertig }, jetzt, false)).toBe("ruhig");
    expect(rundeFaellig({ letzterErfolgAm: vor(1), meta: fertig }, jetzt, true)).toBe("voll");
    // Wird ein Team später zugeordnet, ist eine bereits geholte Seite wieder fällig (seine Spiele fehlen noch)
    expect(rundeFaellig({ letzterErfolgAm: vor(1), meta: { ...fertig, zuordnung: "" } }, jetzt, false, "tusem-essen")).toBe("nie");
    expect(rundeFaellig({ letzterErfolgAm: vor(1), meta: { ...fertig, zuordnung: "tusem-essen" } }, jetzt, false, "tusem-essen")).toBeNull();
  });
  it("berechnet die Kennzahlen eines Spieltags", () => {
    const { spiele } = parseSpieltagSeite(SPIELTAG10, { liga: "hbl2", saison: "2025/26", spieltag: 10 });
    expect(berechneRundenMeta(spiele)).toEqual({ erstes: "2025-10-04", letztes: "2025-10-11", begonnen: 4, beendet: 2, gesamt: 5 });
  });
});

describe("sport.de: Wartezeit nach abgelehnten Anfragen", () => {
  it("403/429 lange, 5xx kurz, Layout- und Netzfehler keine", () => {
    expect(wartezeitNachFehler("HTTP 403")).toBe(6 * 60 * 60_000);
    expect(wartezeitNachFehler("HTTP 429")).toBe(6 * 60 * 60_000);
    expect(wartezeitNachFehler("HTTP 503")).toBe(30 * 60_000);
    expect(wartezeitNachFehler("HTTP 404")).toBe(0);
    expect(wartezeitNachFehler("sport.de: keine Spiel-Links — Layout geändert")).toBe(0);
    expect(wartezeitNachFehler("fetch failed")).toBe(0);
    expect(wartezeitNachFehler(null)).toBe(0);
  });
});

describe("sport.de: Felder und Status", () => {
  const { spiele } = parseSpieltagSeite(SPIELTAG10, { liga: "hbl2", saison: "2025/26", spieltag: 10 });
  const nachId = (id: string) => spiele.find((s) => s.externalMatchId === id)!;
  it("speichert nur bei beendeten Spielen ein Endergebnis; Live/Pause bleiben unbestätigt; kein Ergebnis vor dem Anwurf", () => {
    expect(ligaStatus("finished")).toBe("gespielt");
    expect(ligaStatus("live")).toBe("geplant");
    expect(ligaStatus("halftime")).toBe("geplant");
    expect(ligaStatus("postponed")).toBe("verlegt");
    expect(sportDeSpielFelder(nachId("ma11406368"))).toMatchObject({ toreHeim: 31, toreGast: 32, halbzeitHeim: 16, halbzeitGast: 17, ergebnisBestaetigt: true, status: "gespielt", spieltag: 10, berichtUrl: "/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/" });
    expect(sportDeSpielFelder(nachId("ma11406371"))).toMatchObject({ toreHeim: 22, ergebnisBestaetigt: false, status: "geplant" });
    expect(sportDeSpielFelder(nachId("ma11406372"))).toMatchObject({ toreHeim: null, toreGast: null, uhrzeit: "19:30", ergebnisBestaetigt: false });
  });
  it("normalisiert ein Spiel ins gemeinsame Modell (source sportde)", () => {
    const m = normalizeSportDeMatch(nachId("ma11406368"), { competitionId: "hbl2:2025/26", competitionName: "2. Handball-Bundesliga", season: "2025/26" });
    expect(m).toMatchObject({ source: "sportde", externalMatchId: "ma11406368", status: "finished", homeScore: 31, awayScore: 32, halftimeHomeScore: 16, halftimeAwayScore: 17, matchday: 10 });
    expect(m.startTime.toISOString()).toBe("2025-10-04T10:00:00.000Z"); // 12:00 MESZ (keine Uhrzeit auf der Spieltagsseite)
    expect(m.sourceUrl).toBe("https://www.sport.de/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/");
    expect(normalizeSportDeMatch(nachId("ma11406372"), { competitionId: "x", competitionName: "x", season: "x" }).status).toBe("scheduled");
  });
});

// Erzeugte Spieltagsseiten: Runde 10 = Fixture, davor beendete, danach geplante Spiele von TuSEM Essen; die Tabelle steht auf jeder Seite.
const TABELLE = SPIELTAG10.slice(SPIELTAG10.indexOf("<h2>Tabelle</h2>"), SPIELTAG10.indexOf("<h2>Heimtabelle</h2>"));
function rundenSeite(r: number, ohneSpiel11 = false): string {
  if (r === 10) return SPIELTAG10;
  const tag = new Date(Date.UTC(2025, 8, 1 + 7 * (r - 1)));
  const datum = `${String(tag.getUTCDate()).padStart(2, "0")}.${String(tag.getUTCMonth() + 1).padStart(2, "0")}.${tag.getUTCFullYear()}`;
  const fertig = r < 10;
  const mitte = fertig ? "<b>30:28</b>" : "<b>19:30</b>";
  const extra = fertig ? "<span>Beendet</span>" : "";
  if (r === 11 && ohneSpiel11) return `<html><body><h2>${r}. Spieltag</h2><h3>${datum}</h3><ul><li><a href="/handball/deutschland-2-hbl/ma8000000/a_b/uebersicht/"><span>Andere A</span><b>19:30</b><span>Andere B</span></a></li></ul>${TABELLE}</body></html>`;
  return `<html><body><h2>${r}. Spieltag</h2><h3>${datum}</h3><ul><li><a href="/handball/deutschland-2-hbl/ma80000${String(r).padStart(2, "0")}/tusem-essen_gegner/liveticker/"><span>TuSEM Essen</span>${mitte}<span>Gegner ${r}</span></a>${extra}</li></ul>${TABELLE}</body></html>`;
}
const SPIELE_PRO_RUNDE = (r: number) => (r === 10 ? 1 : 1); // TuSEM Essen spielt je Runde einmal

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

describe.skipIf(!ADMIN_URL)("sport.de-Sync (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  let ligaVereinId: string;
  let aufrufe: string[] = [];
  let kaputt = new Set<number>();
  let ohneSpiel11 = false;
  const hole = async (pfad: string) => {
    aufrufe.push(pfad);
    const r = Number(pfad.match(/\/md(\d+)\//)?.[1]);
    if (!r) throw new Error("HTTP 404");
    if (kaputt.has(r)) return "<html><body><p>Wartungsarbeiten</p></body></html>";
    return rundenSeite(r, ohneSpiel11);
  };
  const lauf = (extra: { jetzt?: Date; voll?: boolean; nurTabelle?: boolean } = {}) => synchronisiereSportDe({ db, hole, liga: "hbl2", saison: "2025/26", jetzt, ...extra });
  const gruppe = () => db.query.ligaGruppen.findFirst({ where: and(eq(schema.ligaGruppen.verband, "SPORTDE"), eq(schema.ligaGruppen.nuligaGroupId, "hbl2:2025/26")) });

  const raeumeAuf = async () => {
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
    await db.delete(schema.ligaQuellenAbrufe);
  };
  beforeAll(async () => {
    await raeumeAuf();
    await db.insert(schema.vereine).values({ id: vereinId, name: "TuSEM Essen" });
    ligaVereinId = (await legeLigaVereinAn(db, { vereinId, nuligaClubId: "424242", name: "TuSEM Essen" })).id;
  });
  afterAll(async () => {
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await raeumeAuf();
    await pool.end();
  });

  it("ohne Zuordnung: nur die Tabellenseite, keine Spiele, kein neuer Verein", async () => {
    aufrufe = [];
    const r = await lauf({ nurTabelle: true });
    expect(r.status).toBe("erfolgreich");
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]).toBe("/handball/deutschland-2-hbl/md1/ergebnisse-und-tabelle/");
    const g = (await gruppe())!;
    expect(g).toMatchObject({ quelle: "sportde", verband: "SPORTDE", spielklasse: "2. HBL" });
    expect((await db.select().from(schema.ligaTabellenzeilen).where(eq(schema.ligaTabellenzeilen.gruppeId, g.id))).map((z) => z.nuligaTeamtableId).sort()).toEqual(["sg-bbm-bietigheim", "tusem-essen", "tv-05-07-huettenberg", "tv-grosswallstadt"]);
    expect(await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id))).toHaveLength(0);
    expect(await db.select().from(schema.ligaVereine)).toHaveLength(1);
  });

  it("Erstimport: alle 34 Spieltage; nur die Spiele des zugeordneten Vereins; Mannschaft, Teilnahme, Spieltag und Abruf-Status", async () => {
    expect(await verknuepfeSportDeTeam(db, ligaVereinId, { externalId: "tusem-essen", name: "TuSEM Essen" })).toEqual({ ok: true });
    aufrufe = [];
    const r = await lauf();
    expect(r.status).toBe("erfolgreich");
    expect(aufrufe).toHaveLength(34); // auch Spieltag 1: er wurde vor der Zuordnung geholt, seine Spiele fehlten noch
    const g = (await gruppe())!;
    const spiele = await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id));
    expect(spiele).toHaveLength(34 * SPIELE_PRO_RUNDE(1)); // je Spieltag ein Spiel von TuSEM Essen (Spieltag 10: ma11406368)
    const fertig = spiele.find((s) => s.externeId === "ma11406368")!;
    expect(fertig).toMatchObject({ quelle: "sportde", spielcode: "ma11406368", spieltag: 10, datum: "2025-10-04", toreHeim: 31, toreGast: 32, halbzeitHeim: 16, halbzeitGast: 17, status: "gespielt", ergebnisBestaetigt: true, berichtUrl: "/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/", heimTeamtableId: "tusem-essen" });
    const geplant = spiele.find((s) => s.spieltag === 11)!;
    expect(geplant).toMatchObject({ status: "geplant", toreHeim: null, uhrzeit: "19:30" });
    const mannschaften = await db.select().from(schema.ligaMannschaften).where(eq(schema.ligaMannschaften.ligaVereinId, ligaVereinId));
    expect(mannschaften).toHaveLength(1);
    expect(mannschaften[0]).toMatchObject({ kategorie: "herren", nummer: 1 });
    const teilnahmen = await db.select().from(schema.ligaTeilnahmen).where(eq(schema.ligaTeilnahmen.mannschaftId, mannschaften[0].id));
    expect(teilnahmen[0]).toMatchObject({ nuligaTeamtableId: "tusem-essen", rang: 3, punktePlus: 7, punkteMinus: 7 });
    const abrufe = await db.select().from(schema.ligaQuellenAbrufe);
    expect(abrufe).toHaveLength(34);
    expect(abrufe.every((a) => a.status === "ok" && a.letzterErfolgAm)).toBe(true);
    expect(abrufe.find((a) => a.schluessel === "hbl2:2025/26:md10")?.meta).toMatchObject({ begonnen: 4, beendet: 2, gesamt: 5 });
    const identitaet = await db.query.ligaExterneIdentitaeten.findFirst({ where: eq(schema.ligaExterneIdentitaeten.externeId, "tusem-essen") });
    expect(identitaet).toMatchObject({ quelle: "sportde", name: "TuSEM Essen" });
    expect(identitaet?.logoUrl).toBe("https://www.sport.de/img/logos/tusem-essen.png"); // aus dem tatsächlichen img/src, nur von sport.de selbst
  });

  it("zweiter Lauf direkt danach: nichts fällig, kein Abruf; nach 11 Minuten nur der heiße Spieltag", async () => {
    aufrufe = [];
    const r = await lauf();
    expect(r.status).toBe("erfolgreich");
    expect(aufrufe).toHaveLength(0);
    aufrufe = [];
    const spaeter = new Date(jetzt.getTime() + 11 * 60_000);
    // Der Erfolgszeitpunkt der Abrufe ist "jetzt" der echten Uhr: für den Test 11 Minuten zurückdrehen.
    await db.update(schema.ligaQuellenAbrufe).set({ letzterErfolgAm: new Date(spaeter.getTime() - 11 * 60_000) });
    const r2 = await lauf({ jetzt: spaeter });
    expect(r2.status).toBe("erfolgreich");
    expect(aufrufe).toEqual(["/handball/deutschland-2-hbl/md10/ergebnisse-und-tabelle/"]);
  });

  it("ein geändertes Layout ändert nichts: Fehler im Abruf-Status, Spiele bleiben", async () => {
    kaputt = new Set([10]);
    const spaeter = new Date(jetzt.getTime() + 30 * 60_000);
    await db.update(schema.ligaQuellenAbrufe).set({ letzterErfolgAm: new Date(spaeter.getTime() - 30 * 60_000) });
    const r = await lauf({ jetzt: spaeter });
    expect(r.status).toBe("fehler");
    expect(r.meldungen.some((m) => m.includes("Spieltag 10"))).toBe(true);
    const a = await db.query.ligaQuellenAbrufe.findFirst({ where: eq(schema.ligaQuellenAbrufe.schluessel, "hbl2:2025/26:md10") });
    expect(a?.status).toBe("fehler");
    expect(a?.letzterFehler).toContain("Layout");
    expect(a?.letzterErfolgAm).not.toBeNull(); // letzter Erfolg bleibt erhalten
    expect(a?.meta).toMatchObject({ gesamt: 5 }); // Kennzahlen bleiben erhalten
    const g = (await gruppe())!;
    expect(await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id))).toHaveLength(34);
    kaputt = new Set();
  });

  it("entfernt ein künftiges Spiel, das sport.de im geholten Spieltag nicht mehr führt, und lässt andere Spieltage unberührt", async () => {
    ohneSpiel11 = true;
    const spaeter = new Date(jetzt.getTime() + 60 * 60_000);
    const r = await lauf({ jetzt: spaeter, voll: true });
    expect(r.status).toBe("erfolgreich");
    const g = (await gruppe())!;
    const spiele = await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id));
    expect(spiele.some((s) => s.spieltag === 11)).toBe(false);
    expect(spiele).toHaveLength(33);
    ohneSpiel11 = false;
  });

  it("ein sport.de-Team gehört genau einem Verein", async () => {
    const vid2 = randomUUID();
    await db.insert(schema.vereine).values({ id: vid2, name: "Anderer Verein" });
    const lv2 = (await legeLigaVereinAn(db, { vereinId: vid2, nuligaClubId: "565656", name: "Anderer Verein" })).id;
    expect((await verknuepfeSportDeTeam(db, lv2, { externalId: "tusem-essen" })).ok).toBe(false);
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vid2));
  });
});
