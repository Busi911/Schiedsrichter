// Tests der HBL-Quelle: HTML-Parser (gegen NACHGEBAUTE Fixtures, siehe __fixtures__/README.md), Adapter, Normalisierung und —
// mit TEST_DATABASE_ADMIN_URL — der Sync gegen ein echtes Postgres. HTTP ist durch die Fixtures ersetzt.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { verknuepfeHblTeam } from "../identitaet";
import { normalizeHblMatch } from "../normalisierung";
import {
  HBL_ENDPUNKTE,
  HblLayoutFehler,
  baueMatchUrl,
  hblParser,
  istErlaubteLogoUrl,
  mappeHblStatus,
  matchIdAusUrl,
  parseDatumText,
  parseSpielZeile,
  parseSpielplanHtml,
  parseSpielseiteHtml,
  parseTabelleHtml,
  parseTeamsHtml,
  teamAusUrl,
} from "./parser";
import { holeLiveStand } from "./live";
import { holeSpielplan } from "./matches";
import { holeTabelle } from "./standings";
import { holeTeams } from "./teams";
import { hblSpielFelder, ligaStatus, synchronisiereHbl } from "./sync";
import type { HblSpiel, HblTeamRef } from "./types";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");
const TEAMS_HTML = fixture("teams.html");
const SPIELPLAN_HTML = fixture("spielplan.html");
const TABELLE_HTML = fixture("tabelle.html");
const LIVE_HTML = fixture("spiel-live.html");

const KIEL = "febf038e-3952-11ef-b7c2-af5c55c3771d";
const FLENSBURG = "1a1b2c3d-3952-11ef-b7c2-af5c55c3771d";
const WETZLAR = "0a1b2c3d-3952-11ef-b7c2-af5c55c3771d";
const STUTTGART = "4a1b2c3d-3952-11ef-b7c2-af5c55c3771d";
const LIVE_SPIEL = "09b2fbf2-79f3-11f1-9c1b-a158a7dfcb39";
const SPIEL_STUWET = "a0000004-5ca6-11f0-bf59-6f5f1c5108cb";
const SPIEL_WET_ESN = "a0000005-5ca6-11f0-bf59-6f5f1c5108cb";

const abfrage = { wettbewerb: "hbl1", saison: "2026/27" } as const;
const REFS: HblTeamRef[] = parseTeamsHtml(TEAMS_HTML, "hbl1").map((t) => ({ externalId: t.externalId, name: t.name }));

describe("HBL: IDs aus öffentlichen Adressen", () => {
  it("liest Team-Code und UUID bzw. Spiel-UUID; Kürzel 'undefined' gilt als fehlend", () => {
    expect(teamAusUrl(`https://www.opel-hbl.de/de/team/THW/${KIEL}`)).toEqual({ code: "THW", externalId: KIEL });
    expect(teamAusUrl(`/de/team/THW/${KIEL}?x=1`)?.externalId).toBe(KIEL);
    expect(teamAusUrl(`/de/team/undefined/${WETZLAR}`)).toEqual({ code: null, externalId: WETZLAR });
    expect(teamAusUrl("/de/team/THW")).toBeNull();
    expect(matchIdAusUrl(`https://www.opel-hbl.de/de/match/${LIVE_SPIEL}`)).toBe(LIVE_SPIEL);
    expect(matchIdAusUrl("/de/match/nicht-gueltig")).toBeNull();
    expect(baueMatchUrl(LIVE_SPIEL)).toBe(`https://www.opel-hbl.de/de/match/${LIVE_SPIEL}`);
  });
  it("kennt die vorgegebenen Adressen", () => {
    expect(HBL_ENDPUNKTE.teams(abfrage)).toBe("/de/hbl/teams");
    expect(HBL_ENDPUNKTE.spielplan({ wettbewerb: "hbl2", saison: "x" })).toBe("/de/2-hbl/spielplan");
    expect(HBL_ENDPUNKTE.tabelle(abfrage)).toBe("/de/hbl/tabelle");
    expect(HBL_ENDPUNKTE.spiel(LIVE_SPIEL)).toBe(`/de/match/${LIVE_SPIEL}`);
    expect(() => HBL_ENDPUNKTE.teams({ wettbewerb: "dhb-pokal", saison: "x" })).toThrow(/keine öffentlichen Adressen/);
  });
});

describe("HBL: Status und Texte", () => {
  it("bildet sichtbare Texte und Sportradar-Namen ab", () => {
    expect(mappeHblStatus("Beendet")).toBe("finished");
    expect(mappeHblStatus("Live")).toBe("live");
    expect(mappeHblStatus("HALFTIME")).toBe("halftime");
    expect(mappeHblStatus("AFTER_PENALTIES")).toBe("finished");
    expect(mappeHblStatus("INTERRUPTED")).toBe("interrupted");
    expect(mappeHblStatus("WAS_ANDERES")).toBeNull();
    expect(mappeHblStatus(null)).toBeNull();
  });
  it("liest Datum und Spielzeilen", () => {
    expect(parseDatumText("4 Okt 26")).toBe("2026-10-04");
    expect(parseDatumText("Do., 8 Okt. 2026")).toBe("2026-10-08");
    expect(parseDatumText("12 Mär 27")).toBe("2027-03-12");
    expect(parseDatumText("Beendet")).toBeNull();
    expect(parseSpielZeile("SC Magdeburg 35 Beendet HC Erlangen 28")).toMatchObject({ heim: "SC Magdeburg", gast: "HC Erlangen", heimTore: 35, gastTore: 28, status: "finished" });
    expect(parseSpielZeile("TVB Stuttgart 26 Live TBV Lemgo Lippe 28")).toMatchObject({ status: "live", heimTore: 26, gastTore: 28 });
    expect(parseSpielZeile("Rhein-Neckar Löwen Do., 19:00 ThSV Eisenach")).toMatchObject({ heim: "Rhein-Neckar Löwen", gast: "ThSV Eisenach", uhrzeit: "19:00", heimTore: null });
    expect(parseSpielZeile("irgendwas anderes")).toBeNull();
  });
});

describe("HBL: Logo-Whitelist", () => {
  it("erlaubt nur https auf bekannten Hosts", () => {
    expect(istErlaubteLogoUrl("https://images.dc.connect.sportradar.com/a.png")).toBe(true);
    expect(istErlaubteLogoUrl("http://images.dc.connect.sportradar.com/a.png")).toBe(false);
    expect(istErlaubteLogoUrl("https://evil.example/a.png")).toBe(false);
    expect(istErlaubteLogoUrl("https://images.dc.connect.sportradar.com.evil.example/a.png")).toBe(false);
    expect(istErlaubteLogoUrl(null)).toBe(false);
  });
});

describe("HBL: Teams (HTML)", () => {
  const teams = parseTeamsHtml(TEAMS_HTML, "hbl1");
  it("liest UUID, Namen und Logos; Skripte zählen nicht", () => {
    expect(teams).toHaveLength(9);
    expect(teams.find((t) => t.externalId === "9a9a9a9a-3952-11ef-b7c2-af5c55c3771d")).toBeUndefined();
    const kiel = teams.find((t) => t.externalId === KIEL)!;
    expect(kiel).toMatchObject({ name: "THW Kiel", code: "THW", league: "hbl1", sourceUrl: `https://www.opel-hbl.de/de/team/THW/${KIEL}` });
    // Next.js-Bildauslieferung: die echte Adresse steckt im Parameter "url"
    expect(kiel.logoUrl).toBe("https://images.dc.connect.sportradar.com/logo/THW.png");
    expect(teams.find((t) => t.externalId === FLENSBURG)?.logoUrl).toBe("https://images.dc.connect.sportradar.com/logo/SGF.png");
  });
  it("Kürzel 'undefined' wird zu null, fremde Logo-Hosts werden verworfen", () => {
    const wetzlar = teams.find((t) => t.externalId === WETZLAR)!;
    expect(wetzlar.code).toBeNull();
    expect(wetzlar.logoUrl).toBeNull();
    expect(wetzlar.name).toBe("HSG Wetzlar");
  });
  it("wirft bei unbekanntem Layout", () => {
    expect(() => parseTeamsHtml("<html><body><p>nichts</p></body></html>", "hbl1")).toThrow(HblLayoutFehler);
  });
});

describe("HBL: Spielplan (HTML)", () => {
  const { spiele, warnungen } = parseSpielplanHtml(SPIELPLAN_HTML, REFS);
  const nachId = (id: string) => spiele.find((s) => s.externalMatchId === id)!;
  it("liest Spiel-UUID, Datum, Stand und Status", () => {
    expect(spiele).toHaveLength(6);
    expect(warnungen).toEqual([]);
    expect(nachId("a0000001-5ca6-11f0-bf59-6f5f1c5108cb")).toMatchObject({ datum: "2026-10-04", status: "finished", homeScore: 35, awayScore: 28, uhrzeit: null, startTime: null });
    expect(nachId(LIVE_SPIEL)).toMatchObject({ status: "live", homeScore: 14, awayScore: 12 });
    expect(nachId(LIVE_SPIEL).home.externalId).toBe(FLENSBURG);
    expect(nachId(LIVE_SPIEL).away.externalId).toBe(KIEL);
  });
  it("künftige Spiele: Uhrzeit in deutscher Ortszeit, kein Ergebnis, Team-UUIDs über die Namen", () => {
    const s = nachId(SPIEL_STUWET);
    expect(s).toMatchObject({ datum: "2026-10-08", uhrzeit: "19:00", status: null, homeScore: null, awayScore: null });
    expect(s.startTime?.toISOString()).toBe("2026-10-08T17:00:00.000Z"); // 19:00 MESZ
    expect(s.home.externalId).toBe(STUTTGART);
    expect(s.away.externalId).toBe(WETZLAR);
  });
  it("meldet nicht zuordenbare Teams, statt zu raten", () => {
    const r = parseSpielplanHtml(SPIELPLAN_HTML, REFS.filter((t) => t.externalId !== WETZLAR));
    expect(r.spiele).toHaveLength(4);
    expect(r.warnungen.some((w) => w.includes("Team nicht zuordenbar"))).toBe(true);
  });
  it("wirft ohne Spiel-Links und bei überwiegend unlesbaren Zeilen", () => {
    expect(() => parseSpielplanHtml("<html><body><h3>4 Okt 26</h3></body></html>", REFS)).toThrow(HblLayoutFehler);
    expect(() => parseSpielplanHtml(SPIELPLAN_HTML, [])).toThrow(HblLayoutFehler);
    const kaputt = `<h3>4 Okt 26</h3><a href="/de/match/${LIVE_SPIEL}">nur ein Titel</a>`;
    expect(() => parseSpielplanHtml(kaputt, REFS)).toThrow(HblLayoutFehler);
  });
  it("nutzt Team-Links in der Zeile, wenn vorhanden", () => {
    const html = `<h3>4 Okt 26</h3><div><a href="/de/match/${LIVE_SPIEL}"><span>Anderer Name</span><span>3</span><span>Beendet</span><span>Noch einer</span><span>2</span></a><a href="/de/team/X/${KIEL}"></a><a href="/de/team/Y/${FLENSBURG}"></a></div>`;
    // zwei Team-Links innerhalb desselben Spiel-Kontexts (ein Spiel-Link): UUIDs aus den Links
    const r = parseSpielplanHtml(html, []);
    expect(r.spiele[0].home.externalId).toBe(KIEL);
    expect(r.spiele[0].away.externalId).toBe(FLENSBURG);
  });
});

describe("HBL: Tabelle (HTML)", () => {
  it("liest Platz, Punkte (10:0), S/U/N, Tore und die UUID aus dem Team-Link", () => {
    const { zeilen, warnungen } = parseTabelleHtml(TABELLE_HTML, []);
    expect(warnungen).toEqual([]);
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0]).toEqual({ teamId: FLENSBURG, name: "SG Flensburg-Handewitt", rang: 1, spiele: 5, siege: 5, unentschieden: 0, niederlagen: 0, torePlus: 181, toreMinus: 157, punktePlus: 10, punkteMinus: 0 });
    expect(zeilen[2]).toMatchObject({ teamId: WETZLAR, rang: 3, punktePlus: 8, punkteMinus: 2, siege: 4, niederlagen: 1 });
  });
  it("funktioniert auch ohne Team-Links (Zuordnung über den Namen) und in beliebigem Layout", () => {
    const html = `<div class="row"><b>1</b><i>THW Kiel</i><i>5</i><i>10:0</i><i>5</i><i>0</i><i>0</i><i>160</i><i>139</i><i>+21</i></div>`;
    const { zeilen } = parseTabelleHtml(html, REFS);
    expect(zeilen[0]).toMatchObject({ teamId: KIEL, rang: 1, torePlus: 160, toreMinus: 139 });
    expect(parseTabelleHtml(html, []).warnungen[0]).toContain("nicht zuordenbar");
  });
  it("wirft bei unbekanntem Layout", () => {
    expect(() => parseTabelleHtml("<table><tr><td>nichts</td></tr></table>", [])).toThrow(HblLayoutFehler);
  });
});

describe("HBL: Spielseite / Live", () => {
  it("liest Stand und Status der Spielseite", () => {
    expect(parseSpielseiteHtml(LIVE_HTML, LIVE_SPIEL)).toEqual({ externalMatchId: LIVE_SPIEL, status: "live", homeScore: 14, awayScore: 12 });
    expect(parseSpielseiteHtml("<main><p>Do., 19:00</p></main>", LIVE_SPIEL)).toBeNull();
  });
  it("holeLiveStand liefert den Stand im Format des match-providers", async () => {
    const stand = await holeLiveStand(async () => LIVE_HTML, HBL_ENDPUNKTE, hblParser, LIVE_SPIEL, new Date("2026-10-04T18:00:00Z"));
    expect(stand).toMatchObject({ status: "live", heimTore: 14, gastTore: 12 });
  });
});

describe("HBL: Adapter-Module", () => {
  const hole = async (pfad: string) =>
    pfad === "/de/hbl/teams" ? TEAMS_HTML : pfad === "/de/hbl/spielplan" ? SPIELPLAN_HTML : pfad === "/de/hbl/tabelle" ? TABELLE_HTML : LIVE_HTML;
  it("holt Teams, Spielplan und Tabelle über die vorgegebenen Pfade", async () => {
    expect(await holeTeams(hole, HBL_ENDPUNKTE, hblParser, abfrage)).toHaveLength(9);
    expect((await holeSpielplan(hole, HBL_ENDPUNKTE, hblParser, abfrage, REFS)).spiele).toHaveLength(6);
    expect((await holeTabelle(hole, HBL_ENDPUNKTE, hblParser, abfrage, [])).zeilen.map((z) => z.rang)).toEqual([1, 2, 3]);
  });
});

describe("HBL: Ergebnis-Felder und Match-Modell", () => {
  const spiel = (status: HblSpiel["status"], h: number | null, g: number | null): HblSpiel => ({
    externalMatchId: LIVE_SPIEL, datum: "2026-10-10", uhrzeit: "19:00", startTime: new Date("2026-10-10T17:00:00Z"), status, matchday: 3,
    home: { externalId: KIEL, name: "THW Kiel", shortName: null }, away: { externalId: FLENSBURG, name: "SG Flensburg-Handewitt", shortName: null },
    homeScore: h, awayScore: g, halftimeHomeScore: null, halftimeAwayScore: null, venue: null,
  });
  it("speichert nur bei beendeten Spielen ein Endergebnis, Zwischenstände unbestätigt, kein 0:0 vor dem Anwurf", () => {
    expect(ligaStatus("finished")).toBe("gespielt");
    expect(ligaStatus("live")).toBe("geplant");
    expect(ligaStatus("postponed")).toBe("verlegt");
    expect(hblSpielFelder(spiel(null, 0, 0))).toMatchObject({ toreHeim: null, toreGast: null, ergebnisBestaetigt: false, status: "geplant", datum: "2026-10-10", uhrzeit: "19:00" });
    expect(hblSpielFelder(spiel("live", 12, 10))).toMatchObject({ toreHeim: 12, toreGast: 10, ergebnisBestaetigt: false });
    expect(hblSpielFelder(spiel("finished", 30, 28))).toMatchObject({ toreHeim: 30, toreGast: 28, ergebnisBestaetigt: true, status: "gespielt" });
  });
  it("normalisiert ein HBL-Spiel, auch ohne Uhrzeit", () => {
    const m = normalizeHblMatch({ ...spiel("finished", 30, 28), uhrzeit: null, startTime: null }, { competitionId: "hbl1:2026/27", competitionName: "Opel HBL", season: "2026/27", logos: new Map([[KIEL, "https://images.dc.connect.sportradar.com/logo/THW.png"]]) });
    expect(m).toMatchObject({ source: "hbl", externalMatchId: LIVE_SPIEL, status: "finished", homeScore: 30, awayScore: 28, matchday: 3, sourceUrl: baueMatchUrl(LIVE_SPIEL) });
    expect(m.startTime.toISOString()).toBe("2026-10-10T10:00:00.000Z"); // 12:00 MESZ als Platzhalter
    expect(m.homeTeam.logoUrl).toContain("THW.png");
    expect(m.awayTeam.logoUrl).toBeUndefined();
  });
});

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

describe.skipIf(!ADMIN_URL)("HBL-Sync (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  const jetzt = new Date("2026-10-01T10:00:00Z");
  let ligaVereinId: string;
  let spielplan = SPIELPLAN_HTML;
  const tabelle = TABELLE_HTML;
  const aufrufe: string[] = [];
  const hole = async (pfad: string) => {
    aufrufe.push(pfad);
    if (pfad === "/de/hbl/teams") return TEAMS_HTML;
    if (pfad === "/de/hbl/spielplan") return spielplan;
    if (pfad === "/de/hbl/tabelle") return tabelle;
    throw new Error("HTTP 404");
  };

  const raeumeAuf = async () => {
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
  };
  const lauf = (extra: { mitTeams?: boolean } = {}) =>
    synchronisiereHbl({ db, hole, endpunkte: HBL_ENDPUNKTE, parser: hblParser, wettbewerb: "hbl1", saison: "2026/27", jetzt, ...extra });
  const gruppe = () => db.query.ligaGruppen.findFirst({ where: and(eq(schema.ligaGruppen.verband, "HBL"), eq(schema.ligaGruppen.nuligaGroupId, "hbl1:2026/27")) });

  beforeAll(async () => {
    await raeumeAuf();
    await db.insert(schema.vereine).values({ id: vereinId, name: "HSG Wetzlar" });
    ligaVereinId = (await legeLigaVereinAn(db, { vereinId, nuligaClubId: "123456", name: "HSG Wetzlar" })).id;
  });
  afterAll(async () => {
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await raeumeAuf();
    await pool.end();
  });

  it("legt ohne Zuordnung keinen Verein, keine Mannschaft und keine Spiele an, aber die Tabelle; Teams werden nur bei Bedarf nachgeladen", async () => {
    const r = await lauf();
    expect(r.status).toBe("erfolgreich");
    expect(r.meldungen.some((m) => m.includes("keinem Verein zugeordnet"))).toBe(true);
    // Die Tabelle kennt nur 3 Teams: der Spielplan lässt sich erst mit der Teamübersicht zuordnen -> sie wird nachgeladen.
    expect(aufrufe).toContain("/de/hbl/teams");
    const g = (await gruppe())!;
    expect(g).toMatchObject({ quelle: "hbl", spielklasse: "1. HBL" });
    expect(await db.select().from(schema.ligaTabellenzeilen).where(eq(schema.ligaTabellenzeilen.gruppeId, g.id))).toHaveLength(3);
    expect(await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id))).toHaveLength(0);
    expect(await db.select().from(schema.ligaVereine)).toHaveLength(1);
  });

  it("mit Teamübersicht: Mannschaft, Teilnahme und nur die Spiele des zugeordneten Vereins; idempotent", async () => {
    expect(await verknuepfeHblTeam(db, ligaVereinId, { externalId: WETZLAR, name: "HSG Wetzlar" })).toEqual({ ok: true });
    const r = await lauf({ mitTeams: true });
    expect(r.status).toBe("erfolgreich");
    const g = (await gruppe())!;
    const spiele = await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id));
    expect(spiele.map((s) => s.externeId).sort()).toEqual([SPIEL_STUWET, SPIEL_WET_ESN].sort());
    const fertig = spiele.find((s) => s.externeId === SPIEL_WET_ESN)!;
    expect(fertig).toMatchObject({ quelle: "hbl", spielcode: SPIEL_WET_ESN, toreHeim: 31, toreGast: 29, status: "gespielt", ergebnisBestaetigt: true, uhrzeit: null });
    const kuenftig = spiele.find((s) => s.externeId === SPIEL_STUWET)!;
    expect(kuenftig).toMatchObject({ datum: "2026-10-08", uhrzeit: "19:00", toreHeim: null, status: "geplant", heimTeamtableId: STUTTGART, gastTeamtableId: WETZLAR });
    expect(kuenftig.beginn?.toISOString()).toBe("2026-10-08T17:00:00.000Z");
    const mannschaften = await db.select().from(schema.ligaMannschaften).where(eq(schema.ligaMannschaften.ligaVereinId, ligaVereinId));
    expect(mannschaften).toHaveLength(1);
    expect(mannschaften[0]).toMatchObject({ kategorie: "herren", nummer: 1 });
    const teilnahmen = await db.select().from(schema.ligaTeilnahmen).where(eq(schema.ligaTeilnahmen.mannschaftId, mannschaften[0].id));
    expect(teilnahmen[0]).toMatchObject({ nuligaTeamtableId: WETZLAR, rang: 3, punktePlus: 8 });
    const identitaet = await db.query.ligaExterneIdentitaeten.findFirst({ where: eq(schema.ligaExterneIdentitaeten.externeId, WETZLAR) });
    expect(identitaet).toMatchObject({ name: "HSG Wetzlar", logoUrl: null });

    const r2 = await lauf({ mitTeams: true });
    expect(r2.neu).toBe(0);
    expect(r2.aktualisiert).toBe(0);
  });

  it("ein geändertes Layout ändert nichts (Spielplan unlesbar -> Meldung, vorhandene Spiele bleiben)", async () => {
    spielplan = "<html><body><p>Wartungsarbeiten</p></body></html>";
    const r = await lauf();
    expect(r.meldungen.some((m) => m.includes("Spielplan nicht lesbar"))).toBe(true);
    const g = (await gruppe())!;
    expect((await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id))).length).toBe(2);
    spielplan = SPIELPLAN_HTML;
  });

  it("aktualisiert Ergebnis/Status und entfernt ein nicht mehr geführtes künftiges Spiel", async () => {
    spielplan = SPIELPLAN_HTML.replace("<span>Do., 19:00</span><span>HSG Wetzlar</span>", "<span>31</span><span>Beendet</span><span>HSG Wetzlar</span><span>29</span>");
    await lauf({ mitTeams: true });
    const g = (await gruppe())!;
    const s = await db.query.ligaSpiele.findFirst({ where: and(eq(schema.ligaSpiele.gruppeId, g.id), eq(schema.ligaSpiele.externeId, SPIEL_STUWET)) });
    expect(s).toMatchObject({ toreHeim: 31, toreGast: 29, status: "gespielt", ergebnisBestaetigt: true });
    // Spiel taucht nicht mehr im Spielplan auf -> künftige Spiele entfernen (das beendete von gestern bleibt)
    const ohne = SPIELPLAN_HTML.replace(/<a class="match" href="\/de\/match\/a0000004[\s\S]*?<\/a>/, "");
    spielplan = ohne;
    await lauf({ mitTeams: true });
    const rest = await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id));
    expect(rest.map((x) => x.externeId)).toEqual([SPIEL_WET_ESN]);
    spielplan = SPIELPLAN_HTML;
  });

  it("ein HBL-Team gehört genau einem Verein", async () => {
    const vid2 = randomUUID();
    await db.insert(schema.vereine).values({ id: vid2, name: "Anderer Verein" });
    const lv2 = (await legeLigaVereinAn(db, { vereinId: vid2, nuligaClubId: "654321", name: "Anderer Verein" })).id;
    expect((await verknuepfeHblTeam(db, lv2, { externalId: WETZLAR })).ok).toBe(false);
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vid2));
  });
});
