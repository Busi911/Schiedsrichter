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
import {
  fehlertext,
  legeLigaVereinAn,
  synchronisiereFreundschaftsspiele,
  synchronisiereSpiele,
  synchronisiereStruktur,
  type HoleHtml,
} from "./sync";
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
    expect(r1.unvollstaendig).toBe(true); // Auslöser für das automatische Weiterladen
    expect(r1.meldungen.some((m) => m.includes("Zeitlimit"))).toBe(true);
    const verein = () => db.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.id, id) });
    expect((await verein())?.strukturSynchronisiertAm).toBeNull(); // bleibt fällig
    expect(
      await db.query.ligaMannschaften.findMany({ where: eq(schema.ligaMannschaften.ligaVereinId, id) })
    ).toHaveLength(7);

    // Fortsetzung ohne Zeitlimit lädt die Tabelle nach
    const r2 = await synchronisiereStruktur(id, { db, holeHtml });
    expect(r2.unvollstaendig).toBe(false); // nur Fehler einzelner Gruppen, nicht das Zeitlimit
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

describe("fehlertext", () => {
  it("nimmt die Ursache statt der langen SQL-Abfrage", () => {
    const err = Object.assign(new Error('Failed query: insert into "x" values ($1) params: 1,2,3'), {
      cause: { message: "duplicate key value", constraint: "liga_spiel_gruppe_nummer_idx" },
    });
    expect(fehlertext(err)).toBe("duplicate key value – Constraint liga_spiel_gruppe_nummer_idx");
    expect(fehlertext(new Error('Failed query: select 1 params: a,b'))).toBe("Failed query: select 1");
    expect(fehlertext("nur Text")).toBe("nur Text");
  });
});

describe.skipIf(!ADMIN_URL)("nuLiga-Sync: robuster Spiele-Import (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  // Portrait, in dem zwei verschiedene Spiele dieselbe Spielnummer (20) tragen
  const portrait = fixture("team-portrait.html")
    .replaceAll("2208495", "2242017")
    .replaceAll("491948", "492633")
    .replace(/(<td class="center">\s*)28(\s*<\/td>)/, "$120$2");
  const holeHtml: HoleHtml = async (url) => {
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
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
    await pool.end();
  });

  it("fasst doppelte Spielnummern zusammen und scheitert nicht am eindeutigen Schlüssel", async () => {
    const { id } = await legeLigaVereinAn(db, { vereinId, nuligaClubId: "69723", name: "TSF Heuchelheim" });
    await synchronisiereStruktur(id, { db, holeHtml });
    const r = await synchronisiereSpiele(id, { db, holeHtml });
    expect(r.meldungen.some((m) => m.includes("doppelte Spielnummern"))).toBe(true);
    expect(r.meldungen.some((m) => m.includes("Failed query"))).toBe(false);
    expect((await db.query.ligaSpiele.findMany()).length).toBe(3);
  });

  it("aktualisiert ein zwischenzeitlich angelegtes Spiel statt zu scheitern (Upsert)", async () => {
    const verein = (await db.query.ligaVereine.findFirst())!;
    const gruppe = (await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.nuligaGroupId, "492633") }))!;
    // Spiel 5 existiert bereits (anderer Lauf) mit abweichendem Stand
    await db.update(schema.ligaSpiele).set({ status: "geplant", toreHeim: null, toreGast: null })
      .where(eq(schema.ligaSpiele.spielnummer, 5));
    // Teilnahme als "nie geladen" markieren und das Spiel aus dem Weg räumen, danach neu laden
    await db.update(schema.ligaTeilnahmen).set({ spieleSynchronisiertAm: null });
    const r = await synchronisiereSpiele(verein.id, { db, holeHtml });
    expect(r.meldungen.some((m) => m.includes("Failed query"))).toBe(false);
    const s5 = await db.query.ligaSpiele.findFirst({
      where: (t, { and, eq: gleich }) => and(gleich(t.gruppeId, gruppe.id), gleich(t.spielnummer, 5)),
    });
    expect(s5?.toreHeim).toBe(33); // wieder auf den Stand von nuLiga gebracht
  });
});

describe.skipIf(!ADMIN_URL)("nuLiga-Sync: zurückgezogene Mannschaft (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  // In der Gruppentabelle steht die mJSG-II-Zeile als "zurückgezogen am …"
  const gruppe = fixture("group-page.html").replace(
    /(teamtable=2242017[^>]*>[^<]*<\/a><\/td>)(?:<td[^>]*>[^<]*<\/td>){7}/,
    '$1<td colspan="7">zurückgezogen am 09.07.2026</td>'
  );
  const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");
  const holeHtml: HoleHtml = async (url) => {
    const p = paramsAusUrl(url);
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && p.get("group") === "492633") return gruppe;
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
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
    await pool.end();
  });

  it("blendet die Mannschaft aus und meldet es", async () => {
    expect(gruppe).toContain("zurückgezogen am 09.07.2026");
    const { id } = await legeLigaVereinAn(db, { vereinId, nuligaClubId: "69723", name: "TSF Heuchelheim" });
    const r = await synchronisiereStruktur(id, { db, holeHtml });
    expect(r.meldungen.some((m) => m.includes("zurückgezogen – wird nicht angezeigt"))).toBe(true);
    const zeile = await db.query.ligaTabellenzeilen.findFirst({
      where: eq(schema.ligaTabellenzeilen.nuligaTeamtableId, "2242017"),
    });
    expect(zeile?.zurueckgezogen).toBe(true);
    const aktive = await db.query.ligaTeilnahmen.findMany({
      where: eq(schema.ligaTeilnahmen.nuligaTeamtableId, "2242017"),
    });
    expect(aktive.length).toBeGreaterThan(0);
    expect(aktive.every((t) => !t.aktiv)).toBe(true);
  });
});

describe.skipIf(!ADMIN_URL)("nuLiga-Sync: Zusatzquelle (Partnerverein, Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();

  // Eigener Verein: ohne die männliche E-Jugend (die läuft unter dem Partner).
  const ohneEJugend = fixture("club-teams.html").replace(/<tr>\s*<td>männliche Jugend E<\/td>[\s\S]*?<\/tr>/, "");
  // Partnerverein: hat u.a. dieselben Mannschaften — gefiltert wird nur die E-Jugend.
  const partner = fixture("club-teams.html");
  let partnerLesbar = true;
  const holeHtml: HoleHtml = async (url) => {
    if (url.includes("/clubTeams")) {
      if (paramsAusUrl(url).get("club") === "999") {
        if (!partnerLesbar) throw new Error("HTTP 503");
        return partner;
      }
      return ohneEJugend;
    }
    throw new Error("HTTP 503"); // keine Gruppen/Portraits nötig
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

  const eigenOhneDII = fixture("club-teams.html").replace(/<tr>\s*<td>männliche Jugend D II<\/td>[\s\S]*?<\/tr>/, "");
  const holeHtmlMitTabelle: HoleHtml = async (url) => {
    const p = paramsAusUrl(url);
    if (url.includes("/clubTeams")) {
      return p.get("club") === "999" ? partner : eigenOhneDII;
    }
    if (url.includes("/groupPage") && p.get("group") === "492633") return fixture("group-page.html");
    throw new Error("HTTP 503");
  };

  const slugs = async (id: string) =>
    (
      await db.query.ligaMannschaften.findMany({
        where: eq(schema.ligaMannschaften.ligaVereinId, id),
      })
    )
      .filter((m) => m.aktiv)
      .map((m) => m.slug)
      .sort();

  it("übernimmt nur gefilterte Mannschaften des Partnervereins und bleibt bei Lesefehlern sicher", async () => {
    const { id } = await legeLigaVereinAn(db, { vereinId, nuligaClubId: "69723", name: "TSF Heuchelheim" });
    expect(await slugs(id)).toEqual([]);

    await synchronisiereStruktur(id, { db, holeHtml });
    expect(await slugs(id)).not.toContain("maennliche-e");

    // Zusatzquelle: nur männliche Jugend, Name enthält "Jugend E"
    await db.insert(schema.ligaVereinZusatzquellen).values({
      ligaVereinId: id,
      nuligaClubId: "999",
      bezeichnung: "Partnerverein",
      kategorien: "jugend_maennlich",
      nameEnthaelt: "Jugend E",
    });
    const r = await synchronisiereStruktur(id, { db, holeHtml });
    expect(r.meldungen.some((m) => m.includes("Zusatzquelle Partnerverein: 1 Mannschaft(en) übernommen"))).toBe(true);
    const nachher = await slugs(id);
    expect(nachher).toContain("maennliche-e");
    expect(nachher).toHaveLength(7); // 6 eigene + 1 vom Partner, nichts weiter vom Partnerverein

    // Partner nicht lesbar: nichts wird deaktiviert, der Lauf meldet es
    partnerLesbar = false;
    const r2 = await synchronisiereStruktur(id, { db, holeHtml });
    expect(r2.status).toBe("teilweise");
    expect(r2.meldungen.some((m) => m.includes("nicht deaktiviert"))).toBe(true);
    expect(await slugs(id)).toContain("maennliche-e");

    // Namensteil, der NUR in der Gruppentabelle steht (nicht in der Vereinsliste
    // des Partnervereins): "Bieber" steckt in "mJSG Heuchelheim/Bieber II".
    await db.delete(schema.ligaVereinZusatzquellen).where(eq(schema.ligaVereinZusatzquellen.ligaVereinId, id));
    await db.insert(schema.ligaVereinZusatzquellen).values({
      ligaVereinId: id,
      nuligaClubId: "999",
      bezeichnung: "Partner-JSG",
      kategorien: "jugend_maennlich",
      nameEnthaelt: "Bieber",
    });
    const rJsg = await synchronisiereStruktur(id, { db, holeHtml: holeHtmlMitTabelle });
    expect(rJsg.meldungen.some((m) => m.includes("Zusatzquelle Partner-JSG: 1 Mannschaft(en) übernommen"))).toBe(true);
    expect(await slugs(id)).toContain("maennliche-d-2");

    // Namensteil, der nirgends vorkommt: nichts wird übernommen, mit erklärender Meldung
    await db.update(schema.ligaVereinZusatzquellen).set({ nameEnthaelt: "Nirgendwo" }).where(eq(schema.ligaVereinZusatzquellen.ligaVereinId, id));
    const rKein = await synchronisiereStruktur(id, { db, holeHtml: holeHtmlMitTabelle });
    expect(rKein.meldungen.some((m) => m.includes("Zusatzquelle Partner-JSG: 0 Mannschaft(en)"))).toBe(true);

    // Zusatzquelle entfernt: die Mannschaft wird beim nächsten Lauf deaktiviert
    partnerLesbar = true;
    await db.delete(schema.ligaVereinZusatzquellen).where(eq(schema.ligaVereinZusatzquellen.ligaVereinId, id));
    await synchronisiereStruktur(id, { db, holeHtml });
    expect(await slugs(id)).not.toContain("maennliche-e");
  });
});

describe.skipIf(!ADMIN_URL)("nuLiga-Sync: Freundschaftsspiele (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();

  // Das Freundschaftsspiel der Vereinsliste gehört hier zur männlichen D-Jugend II
  // (die einzige Mannschaft der Fixture mit Tabellenzuordnung).
  const club = fixture("club-teams.html").replace("<td>Männer/männlich</td>", "<td>männliche Jugend D</td>");
  const portrait = fixture("freundschaft-portrait.html").replace(
    "TSF Heuchelheim&nbsp;1.&nbsp;Männer/männlich",
    "TSF Heuchelheim&nbsp;II.&nbsp;männliche Jugend D"
  );
  const anfragen: string[] = [];
  const holeHtml: HoleHtml = async (url) => {
    anfragen.push(url);
    const p = paramsAusUrl(url);
    if (url.includes("/clubTeams")) return club;
    if (url.includes("/groupPage") && p.get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/groupPage") && p.get("group") === "522635") return fixture("freundschaft-gruppe.html");
    if (url.includes("/teamPortrait") && p.get("teamtable") === "2260175") return portrait;
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

  it("legt das Spiel bei der Mannschaft an, ohne Tabelle, idempotent und robust gegen den Struktur-Sync", async () => {
    const { id } = await legeLigaVereinAn(db, { vereinId, nuligaClubId: "69723", name: "TSF Heuchelheim" });
    const jetzt = new Date("2026-08-30T10:00:00Z");
    await synchronisiereStruktur(id, { db, holeHtml, jetzt });

    const r = await synchronisiereFreundschaftsspiele(id, { db, holeHtml, jetzt });
    expect(r.status).toBe("erfolgreich");
    expect(r.neu).toBeGreaterThan(0);

    const gruppe = await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.nuligaGroupId, "522635") });
    expect(gruppe?.istFreundschaft).toBe(true);
    const spiele = await db.query.ligaSpiele.findMany({ where: eq(schema.ligaSpiele.gruppeId, gruppe!.id) });
    expect(spiele).toHaveLength(1);
    expect(spiele[0]).toMatchObject({
      spielnummer: 0,
      istFreundschaft: true,
      halleName: "Sporthalle Heuchelheim",
      halleNuligaId: "30402",
      meetingId: "8460431",
      toreHeim: 29,
      toreGast: 26,
    });
    // eigene Seite trägt die Teamtable der regulären Teilnahme (D-II: 2242017), der Gegner seine eigene
    expect(spiele[0].heimTeamtableId).toBe("2242017");
    expect(spiele[0].gastTeamtableId).toBe("2260176");

    const mannschaft = await db.query.ligaMannschaften.findFirst({
      where: eq(schema.ligaMannschaften.slug, "maennliche-d-2"),
    });
    const teilnahmen = await db.query.ligaTeilnahmen.findMany({
      where: eq(schema.ligaTeilnahmen.mannschaftId, mannschaft!.id),
    });
    const fs = teilnahmen.find((t) => t.gruppeId === gruppe!.id)!;
    expect(fs).toMatchObject({ aktiv: true, rang: null, punktePlus: null, nuligaTeamtableId: "2260175" });

    // zweiter Lauf: fertig/frisch -> keine Abrufe, nichts neu
    anfragen.length = 0;
    const r2 = await synchronisiereFreundschaftsspiele(id, { db, holeHtml, jetzt });
    expect(r2.neu).toBe(0);
    expect(anfragen.filter((u) => u.includes("/groupPage") || u.includes("/teamPortrait"))).toHaveLength(0);

    // der reguläre Struktur-Sync darf die Freundschafts-Teilnahme nicht deaktivieren
    await synchronisiereStruktur(id, { db, holeHtml, jetzt: new Date(jetzt.getTime() + 2 * 3600_000) });
    const nachher = await db.query.ligaTeilnahmen.findFirst({ where: eq(schema.ligaTeilnahmen.id, fs.id) });
    expect(nachher?.aktiv).toBe(true);

    // der Spiele-Sync der regulären Teilnahmen lädt keine Freundschafts-Portraits
    anfragen.length = 0;
    await synchronisiereSpiele(id, { db, holeHtml, jetzt: new Date(jetzt.getTime() + 3 * 3600_000) });
    expect(anfragen.some((u) => u.includes("teamtable=2260175"))).toBe(false);
  });
});
