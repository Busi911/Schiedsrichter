// Tests der HBL-Quelle: reine Funktionen (IDs, Status, Logo-Whitelist, Normalisierung) und — mit TEST_DATABASE_ADMIN_URL —
// der Sync gegen ein echtes Postgres. Parser und HTTP sind durch Testdaten ersetzt (der echte Parser folgt mit den
// verifizierten Beispielantworten); sie zeigen den Vertrag der Zwischenform.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { verknuepfeHblTeam } from "../identitaet";
import { normalizeHblMatch } from "../normalisierung";
import { baueMatchUrl, holeHblParser, istErlaubteLogoUrl, mappeHblStatus, matchIdAusUrl, teamAusUrl } from "./parser";
import { holeLiveStand } from "./live";
import { holeSpielplan } from "./matches";
import { holeTabelle } from "./standings";
import { holeTeams } from "./teams";
import { hblSpielFelder, ligaStatus, synchronisiereHbl } from "./sync";
import type { HblEndpunkte, HblParser, HblSpiel, HblTabellenzeile, HblTeam } from "./types";

const KIEL = "febf038e-3952-11ef-b7c2-af5c55c3771d";
const WETZLAR = "0a1b2c3d-3952-11ef-b7c2-af5c55c3771d";
const FLENSBURG = "1a1b2c3d-3952-11ef-b7c2-af5c55c3771d";
const SPIEL1 = "b1dc79f0-5ca6-11f0-bf59-6f5f1c5108cb";
const SPIEL2 = "c1dc79f0-5ca6-11f0-bf59-6f5f1c5108cb";
const SPIEL3 = "d1dc79f0-5ca6-11f0-bf59-6f5f1c5108cb";

const team = (externalId: string, code: string, name: string): HblTeam => ({
  externalId,
  code,
  name,
  shortName: code,
  logoUrl: `https://images.dc.connect.sportradar.com/logo/${code}.png`,
});
const TEAMS = [team(KIEL, "THW", "THW Kiel"), team(WETZLAR, "HSG", "HSG Wetzlar"), team(FLENSBURG, "SGF", "SG Flensburg-Handewitt")];

const spiel = (id: string, start: string, heim: HblTeam, gast: HblTeam, status: HblSpiel["status"], h: number | null, g: number | null): HblSpiel => ({
  externalMatchId: id,
  startTime: new Date(start),
  status,
  matchday: 3,
  home: { externalId: heim.externalId, name: heim.name, shortName: heim.shortName },
  away: { externalId: gast.externalId, name: gast.name, shortName: gast.shortName },
  homeScore: h,
  awayScore: g,
  halftimeHomeScore: null,
  halftimeAwayScore: null,
  venue: "Arena",
});

const TABELLE: HblTabellenzeile[] = TEAMS.map((t, i) => ({
  teamId: t.externalId, name: t.name, rang: i + 1, spiele: 2, siege: 1, unentschieden: 0, niederlagen: 1, torePlus: 60, toreMinus: 58, punktePlus: 2, punkteMinus: 2,
}));

const ENDPUNKTE: HblEndpunkte = {
  teams: () => "/t",
  spielplan: () => "/s",
  tabelle: () => "/tab",
  live: (id) => `/live/${id}`,
};

function testParser(spiele: HblSpiel[]): HblParser {
  return {
    teams: () => TEAMS,
    spielplan: () => spiele,
    tabelle: () => TABELLE,
    live: () => ({ externalMatchId: SPIEL1, status: "SECOND_HALF", homeScore: 21, awayScore: 19, spielzeit: "41:12" }),
  };
}

describe("HBL: IDs aus öffentlichen Adressen", () => {
  it("liest Team-Code und UUID bzw. Spiel-UUID", () => {
    expect(teamAusUrl(`https://www.opel-hbl.de/de/team/THW/${KIEL}`)).toEqual({ code: "THW", externalId: KIEL });
    expect(teamAusUrl(`/de/team/THW/${KIEL}?x=1`)?.externalId).toBe(KIEL);
    expect(teamAusUrl("/de/team/THW")).toBeNull();
    expect(matchIdAusUrl(`https://www.opel-hbl.de/de/match/${SPIEL1}`)).toBe(SPIEL1);
    expect(matchIdAusUrl("/de/match/nicht-gueltig")).toBeNull();
    expect(baueMatchUrl(SPIEL1)).toBe(`https://www.opel-hbl.de/de/match/${SPIEL1}`);
  });
});

describe("HBL: Status (Sportradar)", () => {
  it("bildet die Zustände wie vorgegeben ab", () => {
    expect(mappeHblStatus("NOT_STARTED")).toBe("scheduled");
    for (const s of ["FIRST_HALF", "SECOND_HALF", "FIRST_HALF_OT", "SECOND_HALF_OT", "PENALTY_SHOOTING"]) expect(mappeHblStatus(s)).toBe("live");
    expect(mappeHblStatus("HALFTIME")).toBe("halftime");
    expect(mappeHblStatus("OT_HALFTIME")).toBe("halftime");
    for (const s of ["ENDED", "AFTER_OT", "AFTER_PENALTIES"]) expect(mappeHblStatus(s)).toBe("finished");
    expect(mappeHblStatus("INTERRUPTED")).toBe("interrupted");
    expect(mappeHblStatus("ABANDONED")).toBe("cancelled");
    expect(mappeHblStatus("WAS_ANDERES")).toBeNull();
    expect(mappeHblStatus(null)).toBeNull();
  });
  it("speichert nur bei beendeten Spielen ein Endergebnis, Zwischenstände unbestätigt", () => {
    expect(ligaStatus("finished")).toBe("gespielt");
    expect(ligaStatus("live")).toBe("geplant");
    expect(ligaStatus("postponed")).toBe("verlegt");
    expect(ligaStatus("cancelled")).toBe("abgesagt");
    const vor = hblSpielFelder(spiel(SPIEL1, "2026-10-10T17:00:00Z", TEAMS[0], TEAMS[1], "NOT_STARTED", 0, 0));
    expect(vor).toMatchObject({ toreHeim: null, toreGast: null, ergebnisBestaetigt: false, status: "geplant", datum: "2026-10-10", uhrzeit: "19:00" });
    const live = hblSpielFelder(spiel(SPIEL1, "2026-10-10T17:00:00Z", TEAMS[0], TEAMS[1], "SECOND_HALF", 12, 10));
    expect(live).toMatchObject({ toreHeim: 12, toreGast: 10, ergebnisBestaetigt: false });
    const fertig = hblSpielFelder(spiel(SPIEL1, "2026-10-10T17:00:00Z", TEAMS[0], TEAMS[1], "ENDED", 30, 28));
    expect(fertig).toMatchObject({ toreHeim: 30, toreGast: 28, ergebnisBestaetigt: true, status: "gespielt" });
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

describe("HBL: Adapter-Module", () => {
  const hole = async () => ({});
  it("holeTeams verwirft fremde Logo-Hosts und Dubletten", async () => {
    const p = { ...testParser([]), teams: () => [TEAMS[0], { ...TEAMS[0] }, { ...TEAMS[1], logoUrl: "https://evil.example/x.png" }] };
    const teams = await holeTeams(hole, ENDPUNKTE, p, { wettbewerb: "hbl1", saison: "2026/27" });
    expect(teams).toHaveLength(2);
    expect(teams.find((t) => t.externalId === WETZLAR)?.logoUrl).toBeNull();
  });
  it("holeSpielplan: UUID ist der Schlüssel, Spiele ohne Teams fallen weg", async () => {
    const a = spiel(SPIEL1, "2026-10-10T17:00:00Z", TEAMS[0], TEAMS[1], "NOT_STARTED", null, null);
    const kaputt = { ...a, externalMatchId: SPIEL2, home: { ...a.home, externalId: "" } };
    const liste = await holeSpielplan(hole, ENDPUNKTE, testParser([a, { ...a, venue: "neu" }, kaputt]), { wettbewerb: "hbl1", saison: "2026/27" });
    expect(liste).toHaveLength(1);
    expect(liste[0].venue).toBe("neu");
  });
  it("holeTabelle sortiert nach Rang, liefert null ohne Zeilen", async () => {
    const p = { ...testParser([]), tabelle: () => [...TABELLE].reverse() };
    expect((await holeTabelle(hole, ENDPUNKTE, p, { wettbewerb: "hbl1", saison: "x" }))?.map((z) => z.rang)).toEqual([1, 2, 3]);
    expect(await holeTabelle(hole, ENDPUNKTE, { ...p, tabelle: () => null }, { wettbewerb: "hbl1", saison: "x" })).toBeNull();
  });
  it("holeLiveStand liefert den Stand im Format des match-providers", async () => {
    const stand = await holeLiveStand(hole, ENDPUNKTE, testParser([]), SPIEL1, new Date("2026-10-10T18:00:00Z"));
    expect(stand).toMatchObject({ status: "live", heimTore: 21, gastTore: 19, spielzeit: "41:12" });
  });
  it("der Platzhalter-Parser meldet klar, was fehlt", () => {
    expect(() => holeHblParser().spielplan({})).toThrow(/noch nicht eingerichtet/);
  });
});

describe("HBL: gemeinsames Match-Modell", () => {
  it("normalisiert ein HBL-Spiel", () => {
    const m = normalizeHblMatch(spiel(SPIEL1, "2026-10-10T17:00:00Z", TEAMS[0], TEAMS[1], "HALFTIME", 14, 13), {
      competitionId: "hbl1:2026/27",
      competitionName: "Opel HBL",
      season: "2026/27",
      logos: new Map([[KIEL, "https://images.dc.connect.sportradar.com/logo/THW.png"]]),
    });
    expect(m).toMatchObject({ source: "hbl", externalMatchId: SPIEL1, status: "halftime", homeScore: 14, awayScore: 13, matchday: 3, sourceUrl: baueMatchUrl(SPIEL1) });
    expect(m.homeTeam).toMatchObject({ externalId: KIEL, name: "THW Kiel", logoUrl: expect.stringContaining("THW.png") });
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

  const raeumeAuf = async () => {
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
  };
  const lauf = (spiele: HblSpiel[]) =>
    synchronisiereHbl({ db, hole: async () => ({}), endpunkte: ENDPUNKTE, parser: testParser(spiele), wettbewerb: "hbl1", saison: "2026/27", jetzt });
  const alleSpiele = () => [
    spiel(SPIEL1, "2026-10-10T17:00:00Z", TEAMS[0], TEAMS[1], "NOT_STARTED", null, null), // Kiel – Wetzlar
    spiel(SPIEL2, "2026-10-17T17:00:00Z", TEAMS[1], TEAMS[2], "NOT_STARTED", null, null), // Wetzlar – Flensburg
    spiel(SPIEL3, "2026-10-24T17:00:00Z", TEAMS[0], TEAMS[2], "NOT_STARTED", null, null), // Kiel – Flensburg (kein eigener Verein)
  ];

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

  it("legt ohne Zuordnung keinen Verein, keine Mannschaft und keine Spiele an, aber die Tabelle", async () => {
    const r = await lauf(alleSpiele());
    expect(r.status).toBe("erfolgreich");
    expect(r.meldungen.some((m) => m.includes("keinem Verein zugeordnet"))).toBe(true);
    const gruppe = await db.query.ligaGruppen.findFirst({ where: and(eq(schema.ligaGruppen.verband, "HBL"), eq(schema.ligaGruppen.nuligaGroupId, "hbl1:2026/27")) });
    expect(gruppe).toMatchObject({ quelle: "hbl", spielklasse: "1. HBL" });
    expect(await db.select().from(schema.ligaTabellenzeilen).where(eq(schema.ligaTabellenzeilen.gruppeId, gruppe!.id))).toHaveLength(3);
    expect(await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, gruppe!.id))).toHaveLength(0);
    expect(await db.select().from(schema.ligaVereine)).toHaveLength(1);
  });

  it("übernimmt Mannschaft, Teilnahme und nur die Spiele des zugeordneten Vereins; idempotent", async () => {
    expect(await verknuepfeHblTeam(db, ligaVereinId, { externalId: WETZLAR, code: "HSG", name: "HSG Wetzlar" })).toEqual({ ok: true });
    const r = await lauf(alleSpiele());
    expect(r.status).toBe("erfolgreich");
    const gruppe = (await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.nuligaGroupId, "hbl1:2026/27") }))!;
    const spiele = await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, gruppe.id));
    expect(spiele.map((s) => s.externeId).sort()).toEqual([SPIEL1, SPIEL2].sort());
    expect(spiele[0]).toMatchObject({ quelle: "hbl", spielcode: spiele[0].externeId });
    const mannschaften = await db.select().from(schema.ligaMannschaften).where(eq(schema.ligaMannschaften.ligaVereinId, ligaVereinId));
    expect(mannschaften).toHaveLength(1);
    expect(mannschaften[0]).toMatchObject({ kategorie: "herren", nummer: 1 });
    const teilnahmen = await db.select().from(schema.ligaTeilnahmen).where(eq(schema.ligaTeilnahmen.mannschaftId, mannschaften[0].id));
    expect(teilnahmen[0]).toMatchObject({ nuligaTeamtableId: WETZLAR, rang: 2 });
    const identitaet = await db.query.ligaExterneIdentitaeten.findFirst({ where: eq(schema.ligaExterneIdentitaeten.externeId, WETZLAR) });
    expect(identitaet).toMatchObject({ externerCode: "HSG", logoUrl: expect.stringContaining("HSG.png") });

    const r2 = await lauf(alleSpiele());
    expect(r2.neu).toBe(0);
    expect(r2.aktualisiert).toBe(0);
  });

  it("aktualisiert Ergebnis/Status und entfernt ein nicht mehr geführtes künftiges Spiel", async () => {
    const geaendert = alleSpiele().slice(0, 2);
    geaendert[0] = spiel(SPIEL1, "2026-10-10T17:00:00Z", TEAMS[0], TEAMS[1], "ENDED", 31, 29);
    await lauf(geaendert);
    const gruppe = (await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.nuligaGroupId, "hbl1:2026/27") }))!;
    const s1 = await db.query.ligaSpiele.findFirst({ where: and(eq(schema.ligaSpiele.gruppeId, gruppe.id), eq(schema.ligaSpiele.externeId, SPIEL1)) });
    expect(s1).toMatchObject({ toreHeim: 31, toreGast: 29, status: "gespielt", ergebnisBestaetigt: true });
    await lauf([geaendert[0]]);
    const rest = await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, gruppe.id));
    expect(rest.map((x) => x.externeId)).toEqual([SPIEL1]);
  });

  it("ein leerer Abruf ändert nichts", async () => {
    const r = await synchronisiereHbl({ db, hole: async () => ({}), endpunkte: ENDPUNKTE, parser: { ...testParser([]), teams: () => [] }, wettbewerb: "hbl1", saison: "2026/27", jetzt });
    expect(r.status).toBe("fehler");
    expect((await db.select().from(schema.ligaSpiele)).length).toBe(1);
  });

  it("ein HBL-Team gehört genau einem Verein", async () => {
    const vid2 = randomUUID();
    await db.insert(schema.vereine).values({ id: vid2, name: "Anderer Verein" });
    const lv2 = (await legeLigaVereinAn(db, { vereinId: vid2, nuligaClubId: "654321", name: "Anderer Verein" })).id;
    const r = await verknuepfeHblTeam(db, lv2, { externalId: WETZLAR });
    expect(r.ok).toBe(false);
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vid2));
  });
});
