// Integrationstest des nuLiga-Syncs gegen ein ECHTES Postgres (wie
// src/db/tenant-isolation.test.ts): wird übersprungen, wenn keine
// TEST_DATABASE_ADMIN_URL gesetzt ist. HTTP ist durch Fixture-HTML ersetzt.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn, synchronisiereSpiele, synchronisiereStruktur, type HoleHtml } from "./sync";
import { synchronisiereFaellige } from "./sync-cron";
import { eigenerNameImPortrait, ermittleTeamtable, waehleSaison, spielGeaendert } from "./sync-hilfen";
import { paramsAusUrl } from "./html";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const fixture = (n: string) =>
  readFileSync(path.join(import.meta.dirname, "__fixtures__", n), "utf8");

describe("sync-hilfen", () => {
  it("wählt die aktuelle Saison, sonst die neueste vorhandene", () => {
    const t = (saison: string) => ({ regulaer: true, saison }) as never;
    expect(waehleSaison([t("2025/26"), t("2026/27")], new Date("2026-10-01"))).toBe("2026/27");
    expect(waehleSaison([t("2025/26")], new Date("2026-10-01"))).toBe("2025/26");
    expect(waehleSaison([], new Date())).toBeNull();
  });

  it("ordnet Teamtable über Rang+Punkte zu, sonst über Namen/Nummer", () => {
    const tabelle = [1, 2, 3].map((r) => ({
      rang: r,
      mannschaft: r === 3 ? "mJSG Heuchelheim/Bieber II" : `Gegner ${r}`,
      teamtableId: `tt${r}`,
      spiele: 1,
      siege: 1,
      unentschieden: 0,
      niederlagen: 0,
      tore: null,
      punkte: { plus: 2, minus: 0 },
    }));
    const eigen = { rang: 3, punkte: { plus: 2, minus: 0 }, nummer: 2 };
    expect(ermittleTeamtable(eigen, tabelle, "TSF Heuchelheim")).toBe("tt3");
    // Stand veraltet (Rang weicht ab): Name + Nummer entscheiden
    expect(ermittleTeamtable({ ...eigen, rang: 1 }, tabelle, "TSF Heuchelheim")).toBe("tt3");
    expect(ermittleTeamtable({ ...eigen, rang: 9, nummer: 1 }, tabelle, "TSF Heuchelheim")).toBeNull();
  });

  it("erkennt in der Tabelle abgekürzte Vereinsnamen (nuLiga kürzt mit Punkt)", () => {
    const zeile = (rang: number, name: string, id: string) => ({
      rang,
      mannschaft: name,
      teamtableId: id,
      spiele: 1,
      siege: 0,
      unentschieden: 0,
      niederlagen: 1,
      tore: null,
      punkte: { plus: 0, minus: 2 },
    });
    const tabelle = [
      zeile(1, "HSG Pohlheim", "a"),
      zeile(2, "mJSG Heuchelh./Bieber II", "b"),
      zeile(3, "HSG Linden", "c"),
    ];
    // Stand in der Vereinsliste veraltet (Rang 8): der Name entscheidet
    expect(
      ermittleTeamtable({ rang: 8, punkte: { plus: 1, minus: 3 }, nummer: 2 }, tabelle, "TSF Heuchelheim")
    ).toBe("b");
    // erste Mannschaft darf nicht auf die "II" zeigen
    expect(
      ermittleTeamtable({ rang: 9, punkte: null, nummer: 1 }, tabelle, "TSF Heuchelheim")
    ).toBeNull();
  });

  it("erkennt echte nuLiga-Abkürzungen (HSG Dutenh./Münchholzh. II)", () => {
    // Tabelle der weiblichen C-Jugend Bezirksklasse Gr.1 (Namen wie bei nuLiga)
    const namen = [
      "TV Homberg II",
      "TSV Griedel II",
      "HSG Dutenh./Münchholzh. II",
      "HSG Hungen/Lich III",
      "HSG Lumdatal III",
      "JSG Lahntal II",
    ];
    const tabelle = namen.map((mannschaft, i) => ({
      rang: i + 1,
      mannschaft,
      teamtableId: `t${i}`,
      spiele: 2,
      siege: 1,
      unentschieden: 0,
      niederlagen: 1,
      tore: null,
      punkte: { plus: 2, minus: 2 },
    }));
    const verein = "HSG Dutenhofen/Münchholzhausen";
    expect(ermittleTeamtable({ rang: 7, punkte: null, nummer: 2 }, tabelle, verein)).toBe("t2");
    // Nummer 3 ("Hungen/Lich III") darf nicht auf die II zeigen
    expect(ermittleTeamtable({ rang: 7, punkte: null, nummer: 3 }, tabelle, "HSG Hungen/Lich")).toBe("t3");
    expect(ermittleTeamtable({ rang: 7, punkte: null, nummer: 1 }, tabelle, verein)).toBeNull();
  });

  it("findet den eigenen Namen im Portrait (in jedem Spiel enthalten)", () => {
    const spiele = [
      { heim: "SG X", gast: "A" },
      { heim: "B", gast: "SG X" },
      { heim: "SG X", gast: "C" },
    ];
    expect(eigenerNameImPortrait(spiele)).toBe("SG X");
    expect(eigenerNameImPortrait([{ heim: "A", gast: "B" }])).toBeNull();
    expect(eigenerNameImPortrait([])).toBeNull();
  });

  it("erkennt unveränderte Spiele", () => {
    const f = {
      datum: "2026-10-02", uhrzeit: "20:15", beginn: new Date(1), urspruenglicherBeginn: null,
      halleName: null, halleNummer: null, halleNuligaId: null, heimName: "A", gastName: "B",
      heimTeamtableId: null, gastTeamtableId: null, meetingId: null, toreHeim: null, toreGast: null,
      halbzeitHeim: null, halbzeitGast: null, ergebnisBestaetigt: false, status: "geplant" as const,
    };
    expect(spielGeaendert(f, { ...f, beginn: new Date(1) })).toBe(false);
    expect(spielGeaendert(f, { ...f, toreHeim: 1 })).toBe(true);
  });
});

describe.skipIf(!ADMIN_URL)("nuLiga-Sync (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();

  // Fixture-"nuLiga": clubTeams, nur Gruppe 492633 mit Tabelle, Portrait
  // passend zur Männer-Gruppe auf die D-II-Mannschaft umgeschrieben.
  const portrait = fixture("team-portrait.html")
    .replaceAll("2208495", "2242017")
    .replaceAll("491948", "492633");
  const anfragen: string[] = [];
  const holeHtml: HoleHtml = async (url) => {
    anfragen.push(url);
    const p = paramsAusUrl(url);
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && p.get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };

  // Gruppen/Spiele sind global (kein verein_id) und hängen nicht per Cascade
  // am Verein — für einen reproduzierbaren Lauf in der Test-DB aufräumen.
  const raeumeGruppenAuf = async () => {
    await db.delete(schema.ligaVereine); // Reste früherer Läufe (gleiche Club-ID)
    await db.delete(schema.ligaGruppen);
  };

  beforeAll(async () => {
    await raeumeGruppenAuf();
    await db.insert(schema.vereine).values({ id: vereinId, name: "TSF Heuchelheim" });
  });
  afterAll(async () => {
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await raeumeGruppenAuf();
    await pool.end();
  });

  it("legt Struktur + Spiele an, ist idempotent und fehlertolerant", async () => {
    const { id, slug } = await legeLigaVereinAn(db, {
      vereinId,
      nuligaClubId: "69723",
      name: "TSF Heuchelheim",
    });
    expect(slug).toBe("tsf-heuchelheim");
    // zweiter Aufruf legt nichts doppelt an
    expect((await legeLigaVereinAn(db, { vereinId, nuligaClubId: "69723", name: "x" })).id).toBe(id);

    const jetzt = new Date();
    const spaeter = new Date(jetzt.getTime() + 2 * 3600_000); // jenseits der "frisch"-Grenze
    const s1 = await synchronisiereStruktur(id, { db, holeHtml, jetzt });
    // Gruppen ohne Fixture-Seite schlagen fehl -> "teilweise", nicht "fehler"
    expect(s1.status).toBe("teilweise");
    const mannschaften = await db.query.ligaMannschaften.findMany({
      where: eq(schema.ligaMannschaften.ligaVereinId, id),
    });
    // 7 reguläre Mannschaften (ohne "entfällt") — Freundschaft/Quali ausgeschlossen
    expect(mannschaften.map((m) => m.slug).sort()).toEqual([
      "f-maxi-2",
      "frauen",
      "maenner",
      "maenner-2",
      "maennliche-c-2",
      "maennliche-d-2",
      "maennliche-e",
    ]);

    const d2 = mannschaften.find((m) => m.slug === "maennliche-d-2")!;
    const teilnahme = await db.query.ligaTeilnahmen.findFirst({
      where: eq(schema.ligaTeilnahmen.mannschaftId, d2.id),
    });
    expect(teilnahme?.nuligaTeamtableId).toBe("2242017");

    const sp1 = await synchronisiereSpiele(id, { db, holeHtml, jetzt });
    expect(sp1.neu).toBeGreaterThan(0);
    const spiele1 = await db.query.ligaSpiele.findMany();
    expect(spiele1).toHaveLength(4);

    // Idempotenz: zweiter Lauf ändert nichts
    const s2 = await synchronisiereStruktur(id, { db, holeHtml, jetzt: spaeter });
    const sp2 = await synchronisiereSpiele(id, { db, holeHtml, jetzt: spaeter });
    expect(s2.neu).toBe(0);
    expect(s2.aktualisiert).toBe(0);
    expect(sp2.neu).toBe(0);
    expect(sp2.aktualisiert).toBe(0);
    expect(await db.query.ligaSpiele.findMany()).toHaveLength(4);
    expect(await db.query.ligaMannschaften.findMany({
      where: eq(schema.ligaMannschaften.ligaVereinId, id),
    })).toHaveLength(7);

    // Protokoll
    const laeufe = await db.query.ligaSyncLaeufe.findMany({
      where: eq(schema.ligaSyncLaeufe.ligaVereinId, id),
    });
    expect(laeufe.length).toBe(4);
  });

  it("löscht bei unlesbarer clubTeams-Seite nichts", async () => {
    const verein = await db.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.vereinId, vereinId) });
    const kaputt: HoleHtml = async () => "<html>leer</html>";
    const r = await synchronisiereStruktur(verein!.id, { db, holeHtml: kaputt });
    expect(r.status).toBe("fehler");
    expect(
      await db.query.ligaMannschaften.findMany({ where: eq(schema.ligaMannschaften.ligaVereinId, verein!.id) })
    ).toHaveLength(7);
  });

  it("Dispatcher: frisch synchronisierte Vereine sind nicht fällig", async () => {
    const verein = await db.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.vereinId, vereinId) });
    anfragen.length = 0;
    // Struktur ist nach dem "fehler"-Lauf zuletzt jetzt aktualisiert worden
    const r = await synchronisiereFaellige({ db, holeHtml, nurVereinId: verein!.id });
    expect(r[0].struktur).toBeUndefined();
  });
});

describe.skipIf(!ADMIN_URL)("nuLiga-Sync: Zeitlimit (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  const portrait = fixture("team-portrait.html")
    .replaceAll("2208495", "2242017")
    .replaceAll("491948", "492633");
  const anfragen: string[] = [];
  const holeHtml: HoleHtml = async (url) => {
    anfragen.push(url);
    const p = paramsAusUrl(url);
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && p.get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };

  beforeAll(async () => {
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
    await db.insert(schema.vereine).values({ id: vereinId, name: "TSF Heuchelheim" });
  });
  afterAll(async () => {
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await db.delete(schema.ligaGruppen);
    await pool.end();
  });

  it("endet bei abgelaufener Frist ordentlich und setzt beim nächsten Lauf fort", async () => {
    const { id } = await legeLigaVereinAn(db, { vereinId, nuligaClubId: "69723", name: "TSF Heuchelheim" });
    const abgelaufen = Date.now() - 1;

    // Struktur: nur clubTeams wird geladen, Mannschaften entstehen trotzdem
    const r1 = await synchronisiereStruktur(id, { db, holeHtml, frist: abgelaufen });
    expect(anfragen.filter((u) => u.includes("/groupPage"))).toHaveLength(0);
    expect(r1.status).toBe("teilweise");
    expect(r1.meldungen.some((m) => m.includes("Zeitlimit"))).toBe(true);
    const verein = () => db.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.id, id) });
    expect((await verein())?.strukturSynchronisiertAm).toBeNull(); // bleibt fällig
    expect(
      await db.query.ligaMannschaften.findMany({ where: eq(schema.ligaMannschaften.ligaVereinId, id) })
    ).toHaveLength(7);

    // Fortsetzung ohne Zeitlimit lädt die Tabelle nach
    await synchronisiereStruktur(id, { db, holeHtml });
    expect(anfragen.filter((u) => u.includes("/groupPage")).length).toBeGreaterThan(0);
    expect((await verein())?.strukturSynchronisiertAm).not.toBeNull();

    // Spiele: abgelaufene Frist -> kein Portrait geladen, Zeitstempel bleibt leer
    anfragen.length = 0;
    const sp1 = await synchronisiereSpiele(id, { db, holeHtml, frist: abgelaufen });
    expect(anfragen).toHaveLength(0);
    expect(sp1.status).toBe("teilweise");
    expect((await verein())?.spieleSynchronisiertAm).toBeNull();

    // Fortsetzung lädt die Spiele; ein sofortiger weiterer Lauf überspringt "frische" Teams
    const sp2 = await synchronisiereSpiele(id, { db, holeHtml });
    expect(sp2.neu).toBeGreaterThan(0);
    anfragen.length = 0;
    await synchronisiereSpiele(id, { db, holeHtml });
    expect(anfragen.filter((u) => u.includes("/teamPortrait"))).toHaveLength(0);
  });
});
