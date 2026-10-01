// Tests der handball.net-Anbindung: reine Funktionen (Parser, Statusmapping,
// Normalisierung, Tabelle) und — mit TEST_DATABASE_ADMIN_URL — der Sync gegen
// ein echtes Postgres. HTTP ist durch Fixture-JSON ersetzt (Form wie die
// echte API, Personendaten durch Platzhalter; sie dürfen nirgends landen).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { synchronisiereAlleQuellen } from "@/lib/liga-sync-quellen";
import { synchronisiereHandballNet } from "./sync";
import {
  berechneTabelle,
  parseOffizielleTabelle,
  mappeStatus,
  normalisiereHnetTeam,
  parsePhasen,
  parseSpiel,
  parseSpiele,
  parseTeam,
  saisonLabel,
  schoenerTeamname,
} from "./modell";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

const club = (id: string, name: string) => ({
  id,
  name,
  email: "mustermann@example.invalid",
  emergency_phone: "000-MUSTERTELEFON",
  president: "Max Mustermann",
  contact_person: null,
  address: "Musterstraße 1",
});
const DHB_CLUB = club("0b8y490", "HSG Dutenhofen/Münchholzhausen");
const GEGNER = club("1iota6w", "TuS 82 Opladen");
const GEGNER2 = club("2abc123", "SG Beispielstadt");

const status = {
  offen: { id: 2, name: "Pendiente", short_name: "PEN", is_live: false, is_finished: false, is_sanction: false },
  fertig: { id: 3, name: "Finalizado", short_name: "FIN", is_live: false, is_finished: true, is_sanction: false },
};
const referees = [
  { id: "x1", first_name: "Erika", last_name: "Mustermann", role: { id: 1, name: "SCHIEDSRICHTER" } },
];
const feld = {
  id: 11746,
  name: "BIELERT-SPORTHALLE OPLADEN",
  installation: { id: 10491, name: "BIELERT-SPORTHALLE OPLADEN", city: "LEVERKUSEN" },
};
const spiel = (
  id: number,
  code: string,
  datum: string,
  heim: [number, string, object],
  gast: [number, string, object],
  st: object,
  result: object = { local: null, visitor: null }
) => ({
  id,
  code,
  date: datum,
  status: st,
  local: { id: heim[0], name: heim[1], club: heim[2] },
  visitor: { id: gast[0], name: gast[1], club: gast[2] },
  result,
  field: feld,
  referees,
});

const PHASE = {
  id: 14055,
  name: "Süd-West",
  has_standings: true,
  competition: { id: 6595, name: "3. Liga Männer" },
};
const EIGEN = [69770, "HSG DUTENHOFEN MÜNCHHOLZHAUSEN II", DHB_CLUB] as [number, string, object];
const OPL = [87365, "TUS 82 OPLADEN", GEGNER] as [number, string, object];
const BEI = [90001, "SG BEISPIELSTADT", GEGNER2] as [number, string, object];

const phasenSpiele = [
  spiel(414632, "2627DHB3LERMC0701", "2026-10-04T17:00:00+00:00", OPL, EIGEN, status.offen),
  spiel(414600, "2627DHB3LERMC0601", "2026-09-27T17:00:00+00:00", EIGEN, BEI, status.fertig, { local: 30, visitor: 25 }),
  spiel(414601, "2627DHB3LERMC0602", "2026-09-27T19:00:00+00:00", OPL, BEI, status.fertig, { local: 28, visitor: 28 }),
];

describe("handball.net-Modell", () => {
  it("liest Team, Wettbewerbe und Spiele und ignoriert Personendaten", () => {
    const team = parseTeam({
      id: 69770,
      name: "HSG DUTENHOFEN MÜNCHHOLZHAUSEN II",
      club: DHB_CLUB,
      responsable: { first_name: "Max", last_name: "Mustermann" },
      gender: { id: "M" },
      age_category: { id: 1, name: "ERWACHSENE" },
    });
    expect(team).toEqual({
      id: "69770",
      name: "HSG DUTENHOFEN MÜNCHHOLZHAUSEN II",
      gender: "m",
      ageCategory: "ERWACHSENE",
      clubId: "0b8y490",
      clubName: "HSG Dutenhofen/Münchholzhausen",
    });
    expect(parsePhasen([PHASE])).toEqual([
      { id: "14055", name: "Süd-West", competitionId: "6595", competitionName: "3. Liga Männer", hatTabelle: true },
    ]);
    const s = parseSpiele(phasenSpiele)[0];
    expect(s.code).toBe("2627DHB3LERMC0701");
    expect(s.datum).toBe("2026-10-04");
    expect(s.uhrzeit).toBe("17:00");
    // Ortszeit statt UTC: 17:00 Berliner Zeit (Sommerzeit) = 15:00 UTC
    expect(s.beginn.toISOString()).toBe("2026-10-04T15:00:00.000Z");
    expect(s.halle).toEqual({ id: "10491", name: "BIELERT-SPORTHALLE OPLADEN" });
    expect(s.toreHeim).toBeNull();
    // Whitelist: keine Personen-/Kontaktdaten im Ergebnis
    const json = JSON.stringify([team, parsePhasen([PHASE]), parseSpiele(phasenSpiele)]);
    for (const verboten of ["Mustermann", "mustermann@", "MUSTERTELEFON", "Musterstraße", "Erika", "SCHIEDSRICHTER"]) {
      expect(json).not.toContain(verboten);
    }
  });

  it("mappt Status und Ergebnis (nur bei beendeten Spielen)", () => {
    expect(mappeStatus(status.offen)).toBe("geplant");
    expect(mappeStatus(status.fertig)).toBe("gespielt");
    expect(mappeStatus({ is_sanction: true })).toBe("nicht_angetreten");
    expect(mappeStatus({ name: "Aplazado" })).toBe("verlegt");
    expect(mappeStatus({ name: "Cancelado" })).toBe("abgesagt");
    expect(mappeStatus({ name: "Unbekannt" })).toBe("geplant");
    const fertig = parseSpiel(phasenSpiele[1])!;
    expect([fertig.status, fertig.toreHeim, fertig.toreGast]).toEqual(["gespielt", 30, 25]);
    // Zwischenstand eines laufenden Spiels wird nicht als Ergebnis geführt
    const live = parseSpiel({
      ...phasenSpiele[0],
      status: { ...status.offen, is_live: true },
      result: { local: 5, visitor: 3 },
    })!;
    expect([live.status, live.toreHeim]).toEqual(["geplant", null]);
  });

  it("normalisiert Teams aus Geschlecht, Altersklasse und Nummer", () => {
    const t = (name: string, gender: "m" | "w", ageCategory: string) => ({
      id: "1",
      name,
      gender,
      ageCategory,
      clubId: "x",
      clubName: "x",
    });
    expect(normalisiereHnetTeam(t("HSG X II", "m", "ERWACHSENE")).schluessel).toBe("herren:::2");
    expect(normalisiereHnetTeam(t("HSG X", "w", "ERWACHSENE")).schluessel).toBe("damen:::1");
    const jugend = normalisiereHnetTeam(t("HSG X", "m", "B-JUGEND"));
    expect(jugend.schluessel).toBe("jugend_maennlich:B::1");
    expect(jugend.slug).toBe("maennliche-b");
    expect(normalisiereHnetTeam(t("HSG X III", "w", "A-JUGEND")).slug).toBe("weibliche-a-3");
  });

  it("schreibt Teamnamen in Vereinsschreibweise", () => {
    expect(schoenerTeamname("TUS 82 OPLADEN", "TuS 82 Opladen")).toBe("TuS 82 Opladen");
    expect(schoenerTeamname("HSG DUTENHOFEN MÜNCHHOLZHAUSEN II", "HSG Dutenhofen/Münchholzhausen")).toBe(
      "HSG Dutenhofen/Münchholzhausen II"
    );
    expect(schoenerTeamname("ANDERER NAME", "TuS 82 Opladen")).toBe("ANDERER NAME");
    expect(saisonLabel("Saison 2026/2027")).toBe("2026/27");
  });

  it("berechnet die Tabelle aus beendeten Spielen", () => {
    const tabelle = berechneTabelle(parseSpiele(phasenSpiele));
    expect(tabelle.map((z) => [z.rang, z.name, z.punktePlus, z.punkteMinus, z.spiele])).toEqual([
      [1, "HSG Dutenhofen/Münchholzhausen II", 2, 0, 1],
      [2, "TuS 82 Opladen", 1, 1, 1],
      [3, "SG Beispielstadt", 1, 3, 2],
    ]);
  });

  it("übernimmt die offizielle Tabelle ohne Vereinskontakte", () => {
    const zeile = (position: number, played: number, won: number, drawn: number, lost: number, points: number) => ({
      position,
      team: {
        id: 69770 + position,
        name: "TUS 82 OPLADEN",
        club: { name: "TuS 82 Opladen", email: "geheim@example.org", emergency_phone: "0123", address: "Weg 1" },
      },
      played, won, drawn, lost,
      goals_for: 10, goals_against: 8, goals_diff: 2, points,
      form: [{ match_id: 1, result: "W" }],
    });
    const t = parseOffizielleTabelle({ data: [zeile(2, 5, 2, 0, 3, 4), zeile(1, 5, 5, 0, 0, 10)] });
    expect(t?.map((z) => [z.rang, z.name, z.punktePlus, z.punkteMinus])).toEqual([
      [1, "TuS 82 Opladen", 10, 0],
      [2, "TuS 82 Opladen", 4, 6],
    ]);
    expect(JSON.stringify(t)).not.toMatch(/geheim|0123|Weg 1/);
    expect(parseOffizielleTabelle({ data: [zeile(1, 5, 5, 1, 0, 10)] })).toBeNull();
    expect(parseOffizielleTabelle({ data: [] })).toBeNull();
    expect(parseOffizielleTabelle(null)).toBeNull();
  });
});

describe.skipIf(!ADMIN_URL)("handball.net-Sync (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  const aufruf: string[] = [];
  let teamlisteVerfuegbar = false;

  const holeJson = async (pfad: string): Promise<unknown> => {
    aufruf.push(pfad);
    const ok = (data: unknown) => ({ success: true, data, pagination: { current_page: 1, last_page: 1 } });
    if (pfad === "/api/new/seasons")
      return { data: [{ id: 2627, name: "Saison 2026/2027", start_date: "2026-07-01", end_date: "2027-06-30", is_active: true }] };
    if (pfad.startsWith("/api/new/teams?club_id=0b8y490")) {
      if (!teamlisteVerfuegbar) throw new Error("HTTP 404");
      return ok([{ id: 69770, name: EIGEN[1], club: DHB_CLUB, gender: { id: "M" }, age_category: { id: 1, name: "ERWACHSENE" } }]);
    }
    if (pfad.startsWith("/api/new/teams/clubs") || pfad.startsWith("/api/new/clubs")) throw new Error("HTTP 404");
    if (pfad === "/api/new/teams/69770")
      return ok({ id: 69770, name: EIGEN[1], club: DHB_CLUB, gender: { id: "M" }, age_category: { id: 1, name: "ERWACHSENE" } });
    if (pfad.startsWith("/api/new/teams/69770/competitions")) return ok([PHASE]);
    if (pfad.startsWith("/api/new/matches?team_id=69770")) return ok(phasenSpiele.filter((s) => s.local.id === 69770 || s.visitor.id === 69770));
    if (pfad.startsWith("/api/new/matches?phase_id=14055")) return ok(phasenSpiele);
    throw new Error("HTTP 404");
  };

  const raeumeAuf = async () => {
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
  };
  beforeAll(async () => {
    await raeumeAuf();
    await db.insert(schema.vereine).values({ id: vereinId, name: "HSG Dutenhofen/Münchholzhausen" });
  });
  afterAll(async () => {
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await raeumeAuf();
    await pool.end();
  });

  it("meldet eine nicht abrufbare Teamliste und nutzt manuelle Team-IDs", async () => {
    const { id } = await legeLigaVereinAn(db, {
      vereinId,
      handballNetClubId: "0b8y490",
      handballNetTeamIds: "69770",
      name: "HSG Dutenhofen/Münchholzhausen",
    });
    const jetzt = new Date("2026-10-01T10:00:00Z");
    const r = await synchronisiereHandballNet(id, { db, holeJson, jetzt });
    expect(r.status).toBe("erfolgreich");
    // Teamliste nicht abrufbar, aber die manuelle ID genügt (keine Fehlermeldung nötig)
    expect(r.meldungen.some((m) => m.includes("Tabelle aus Spielergebnissen berechnet"))).toBe(true);

    const m = await db.query.ligaMannschaften.findMany({ where: eq(schema.ligaMannschaften.ligaVereinId, id) });
    expect(m.map((x) => [x.slug, x.kategorie, x.nummer, x.aktiv])).toEqual([["maenner-2", "herren", 2, true]]);

    const gruppe = (await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.verband, "DHB") }))!;
    expect([gruppe.quelle, gruppe.ligaName, gruppe.saison]).toEqual(["handball_net", "3. Liga Männer - Süd-West", "2026/27"]);

    const spiele = await db.query.ligaSpiele.findMany({ where: eq(schema.ligaSpiele.gruppeId, gruppe.id) });
    expect(spiele.map((s) => [s.spielcode, s.spielnummer, s.quelle]).sort()).toEqual([
      ["2627DHB3LERMC0601", null, "handball_net"],
      ["2627DHB3LERMC0701", null, "handball_net"],
    ]);
    const heim = spiele.find((s) => s.spielcode === "2627DHB3LERMC0601")!;
    expect([heim.toreHeim, heim.toreGast, heim.status, heim.heimName]).toEqual([
      30,
      25,
      "gespielt",
      "HSG Dutenhofen/Münchholzhausen II",
    ]);
    expect(spiele.find((s) => s.spielcode === "2627DHB3LERMC0701")!.halleNuligaId).toBe("10491");

    const tabelle = await db.query.ligaTabellenzeilen.findMany({ where: eq(schema.ligaTabellenzeilen.gruppeId, gruppe.id) });
    expect(tabelle).toHaveLength(3);
    const teilnahme = (await db.query.ligaTeilnahmen.findFirst({ where: eq(schema.ligaTeilnahmen.gruppeId, gruppe.id) }))!;
    expect([teilnahme.nuligaTeamtableId, teilnahme.rang, teilnahme.punktePlus]).toEqual(["69770", 1, 2]);

    // Datenschutz: nirgends Personendaten in der DB
    const alles = JSON.stringify([m, gruppe, spiele, tabelle, teilnahme]);
    for (const verboten of ["Mustermann", "mustermann@", "MUSTERTELEFON", "Erika"]) {
      expect(alles).not.toContain(verboten);
    }

    // Idempotent: zweiter Lauf (nach "frisch") ändert nichts
    const r2 = await synchronisiereHandballNet(id, { db, holeJson, jetzt: new Date(jetzt.getTime() + 2 * 3600_000) });
    expect([r2.neu, r2.aktualisiert]).toEqual([0, 0]);
    expect(await db.query.ligaSpiele.findMany({ where: eq(schema.ligaSpiele.gruppeId, gruppe.id) })).toHaveLength(2);
  });

  it("findet Teams über die Vereins-ID, wenn die Teamliste verfügbar ist, und ein Ausfall bricht nichts", async () => {
    const v = (await db.query.ligaVereine.findFirst())!;
    await db.update(schema.ligaVereine).set({ handballNetTeamIds: null }).where(eq(schema.ligaVereine.id, v.id));
    teamlisteVerfuegbar = true;
    const r = await synchronisiereHandballNet(v.id, { db, holeJson, jetzt: new Date("2026-10-02T10:00:00Z") });
    expect(r.status).toBe("erfolgreich");

    // Ergebnis ändert sich -> Aktualisierung
    const geaendert = (pfad: string) =>
      holeJson(pfad).then((antwort) => {
        const a = antwort as { data?: unknown };
        if (pfad.startsWith("/api/new/matches?team_id")) {
          return {
            ...a,
            data: (a.data as ReturnType<typeof spiel>[]).map((s) =>
              s.code === "2627DHB3LERMC0701" ? { ...s, status: status.fertig, result: { local: 20, visitor: 22 } } : s
            ),
          };
        }
        return antwort;
      });
    const r2 = await synchronisiereHandballNet(v.id, { db, holeJson: geaendert, jetzt: new Date("2026-10-05T10:00:00Z") });
    expect(r2.aktualisiert).toBeGreaterThanOrEqual(1);
    const g = (await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.verband, "DHB") }))!;
    const s = await db.query.ligaSpiele.findFirst({
      where: and(eq(schema.ligaSpiele.gruppeId, g.id), eq(schema.ligaSpiele.spielcode, "2627DHB3LERMC0701")),
    });
    expect([s!.toreHeim, s!.toreGast]).toEqual([20, 22]);

    // Totalausfall von handball.net: Fehler im Protokoll, bestehende Daten bleiben
    const ausfall = async () => {
      throw new Error("HTTP 503");
    };
    const r3 = await synchronisiereHandballNet(v.id, { db, holeJson: ausfall, jetzt: new Date("2026-10-06T10:00:00Z") });
    expect(r3.status).toBe("fehler");
    expect(await db.query.ligaSpiele.findMany({ where: eq(schema.ligaSpiele.gruppeId, g.id) })).toHaveLength(2);
  });
});

describe.skipIf(!ADMIN_URL)("nuLiga und handball.net gemeinsam (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "../nuliga/__fixtures__", n), "utf8");
  const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");
  const holeHtml = async (url: string) => {
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && url.includes("492633")) return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };
  const holeJson = async (pfad: string): Promise<unknown> => {
    const ok = (data: unknown) => ({ data, pagination: { last_page: 1 } });
    const team = { id: 69770, name: "HSG TEST II", club: DHB_CLUB, gender: { id: "M" }, age_category: { id: 1, name: "ERWACHSENE" } };
    if (pfad === "/api/new/seasons")
      return { data: [{ id: 2627, name: "Saison 2026/2027", start_date: "2026-07-01", end_date: "2027-06-30" }] };
    if (pfad === "/api/new/teams/69770") return ok(team);
    if (pfad.startsWith("/api/new/teams/69770/competitions")) return ok([PHASE]);
    if (pfad.startsWith("/api/new/matches")) return ok(phasenSpiele);
    throw new Error("HTTP 404");
  };
  const raeumeAuf = async () => {
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
  };
  beforeAll(async () => {
    await raeumeAuf();
    await db.insert(schema.vereine).values({ id: vereinId, name: "TSF Heuchelheim" });
  });
  afterAll(async () => {
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await raeumeAuf();
    await pool.end();
  });

  it("beide Quellen liegen nebeneinander; Wiederholung lässt keine Quelle die andere deaktivieren", async () => {
    const { id } = await legeLigaVereinAn(db, {
      vereinId,
      nuligaClubId: "69723",
      handballNetClubId: "0b8y490",
      handballNetTeamIds: "69770",
      name: "TSF Heuchelheim",
    });
    const lauf = async (jetzt: Date, json = holeJson) =>
      synchronisiereAlleQuellen(id, { db, holeHtml, holeJson: json, jetzt });
    const r1 = await lauf(new Date());
    expect(["erfolgreich", "teilweise"]).toContain(r1.status);
    const zaehle = async () =>
      (
        await db
          .select({ quelle: schema.ligaGruppen.quelle, aktiv: schema.ligaTeilnahmen.aktiv })
          .from(schema.ligaTeilnahmen)
          .innerJoin(schema.ligaGruppen, eq(schema.ligaGruppen.id, schema.ligaTeilnahmen.gruppeId))
      ).filter((z) => z.aktiv);
    const aktiv1 = await zaehle();
    expect(aktiv1.some((z) => z.quelle === "nuliga")).toBe(true);
    expect(aktiv1.some((z) => z.quelle === "handball_net")).toBe(true);

    // handball.net fällt aus: nuLiga bleibt unberührt, Gesamtstatus teilweise (nicht fehler)
    const kaputt = async () => {
      throw new Error("HTTP 503");
    };
    const r2 = await lauf(new Date(Date.now() + 3 * 3600_000), kaputt);
    expect(r2.status).toBe("teilweise");
    const aktiv2 = await zaehle();
    expect(aktiv2.length).toBe(aktiv1.length);
  });
});
