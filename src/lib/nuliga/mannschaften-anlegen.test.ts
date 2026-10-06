// Integrationstest (ECHTES Postgres, übersprungen ohne TEST_DATABASE_ADMIN_URL): Liga-Mannschaften -> Mannschaften des Vereins.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn, synchronisiereSpiele, synchronisiereStruktur, type HoleHtml } from "./sync";
import { paramsAusUrl } from "./html";
import { baueMannschaftsAufloeser, legeVereinsMannschaftenAn, verknuepfeTermineMitMannschaften } from "./mannschaften-anlegen";

vi.mock("server-only", () => ({}));
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "__fixtures__", n), "utf8");

describe.skipIf(!ADMIN_URL)("Mannschaften des Vereins aus der Liga (Postgres)", () => {
  const vereinId = randomUUID();
  const manuellId = randomUUID();
  let ligaVereinId: string;
  const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");
  const holeHtml: HoleHtml = async (url) => {
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && paramsAusUrl(url).get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };
  const eigene = () => testDb.select().from(schema.mannschaften).where(eq(schema.mannschaften.vereinId, vereinId));

  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine);
    await testDb.delete(schema.ligaGruppen);
    await testDb.insert(schema.vereine).values([{ id: vereinId, name: "TSF Heuchelheim" }, { id: manuellId, name: "Hat eigene Mannschaften" }]);
    ligaVereinId = (await legeLigaVereinAn(testDb, { vereinId, nuligaClubId: "69723", name: "TSF Heuchelheim" })).id;
    const jetzt = new Date("2026-10-01T10:00:00Z");
    await synchronisiereStruktur(ligaVereinId, { db: testDb, holeHtml, jetzt });
    await synchronisiereSpiele(ligaVereinId, { db: testDb, holeHtml, jetzt });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, manuellId));
    await testDb.delete(schema.ligaGruppen);
    await pool.end();
  });

  it("legt für einen Verein ohne Mannschaften alle aktiven Liga-Mannschaften an, mit Verweis und Kategorie", async () => {
    const r = await legeVereinsMannschaftenAn(testDb, vereinId);
    expect(r).toEqual({ modus: "neu", angelegt: 7 });
    const liste = await eigene();
    expect(liste).toHaveLength(7);
    expect(liste.every((m) => m.ligaMannschaftId)).toBe(true);
    const ligaD2 = await testDb.query.ligaMannschaften.findFirst({ where: eq(schema.ligaMannschaften.slug, "maennliche-d-2") });
    const d2 = liste.find((m) => m.ligaMannschaftId === ligaD2!.id);
    expect(d2?.altersklasse).toBe("mJD");
    expect(d2?.name).toBe(ligaD2!.name);
    expect(liste.find((m) => m.altersklasse === "Mä/männl.")).toBeTruthy();
  });

  it("ist idempotent, ergänzt später neue Liga-Mannschaften und benennt nie um", async () => {
    const vorher = await eigene();
    expect(await legeVereinsMannschaftenAn(testDb, vereinId)).toEqual({ modus: "fortgesetzt", angelegt: 0 });
    await testDb.update(schema.mannschaften).set({ name: "Mein eigener Name" }).where(eq(schema.mannschaften.id, vorher[0].id));
    await testDb.insert(schema.ligaMannschaften).values({ ligaVereinId, slug: "neu-test", schluessel: "neu-test", name: "Neue Mannschaft", kategorie: "herren", geschlecht: "m", nummer: 9 });
    expect(await legeVereinsMannschaftenAn(testDb, vereinId)).toEqual({ modus: "fortgesetzt", angelegt: 1 });
    const nachher = await eigene();
    expect(nachher).toHaveLength(8);
    expect(nachher.find((m) => m.id === vorher[0].id)?.name).toBe("Mein eigener Name");
  });

  it("fasst Vereine mit eigenen, unverknüpften Mannschaften nicht an", async () => {
    await testDb.insert(schema.mannschaften).values({ vereinId: manuellId, name: "Herren 1" });
    await testDb.insert(schema.ligaVereine).values({ vereinId: manuellId, slug: "manuell-test", name: "Manuell", nuligaClubId: "99999" });
    expect(await legeVereinsMannschaftenAn(testDb, manuellId)).toEqual({ modus: "manuell", angelegt: 0 });
    expect(await testDb.select().from(schema.mannschaften).where(eq(schema.mannschaften.vereinId, manuellId))).toHaveLength(1);
  });

  it("ordnet Liga-Termine exakt über die Teamtable-ID der verknüpften Mannschaft zu (nur leere Zuordnungen)", async () => {
    const spiele = await testDb
      .select({ s: schema.ligaSpiele })
      .from(schema.ligaSpiele)
      .innerJoin(schema.ligaTeilnahmen, and(eq(schema.ligaTeilnahmen.gruppeId, schema.ligaSpiele.gruppeId), eq(schema.ligaTeilnahmen.nuligaTeamtableId, schema.ligaSpiele.heimTeamtableId)));
    expect(spiele.length).toBeGreaterThan(0);
    const spiel = spiele[0].s;
    const aufloeser = await baueMannschaftsAufloeser(testDb, vereinId);
    const erwartet = aufloeser(spiel);
    expect(erwartet).toBeTruthy();

    const [termin] = await testDb
      .insert(schema.termine)
      .values({ vereinId, typ: "rundenspiel", quelle: "rundenspiel_import", start: new Date("2026-11-01T10:00:00Z"), icsUid: `liga:${spiel.id}`, ligaSpielId: spiel.id })
      .returning();
    expect(termin.mannschaftId).toBeNull();
    expect(await verknuepfeTermineMitMannschaften(testDb, vereinId)).toBe(1);
    expect((await testDb.query.termine.findFirst({ where: eq(schema.termine.id, termin.id) }))?.mannschaftId).toBe(erwartet);
    // zweiter Lauf: nichts mehr zu tun, bestehende Zuordnung bleibt
    expect(await verknuepfeTermineMitMannschaften(testDb, vereinId)).toBe(0);
  });
});
