// Integrationstest der Übernahme (Schritt 3) gegen ein ECHTES Postgres
// (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn, synchronisiereSpiele, synchronisiereStruktur, type HoleHtml } from "./nuliga/sync";
import { paramsAusUrl } from "./nuliga/html";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const mailSpy = vi.fn();
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mailer", () => ({ sendMail: (...a: unknown[]) => mailSpy(...a) }));

const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "nuliga", "__fixtures__", n), "utf8");

describe.skipIf(!ADMIN_URL)("Liga-Übernahme (Postgres)", () => {
  const vereinId = randomUUID();
  const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");
  const holeHtml: HoleHtml = async (url) => {
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && paramsAusUrl(url).get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };
  let ligaVereinId: string;

  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine);
    await testDb.delete(schema.ligaGruppen);
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "TSF Übernahme" });
    const { id } = await legeLigaVereinAn(testDb, { vereinId, nuligaClubId: "69723", name: "TSF Übernahme" });
    ligaVereinId = id;
    const jetzt = new Date("2026-10-01T10:00:00Z");
    await synchronisiereStruktur(id, { db: testDb, holeHtml, jetzt });
    await synchronisiereSpiele(id, { db: testDb, holeHtml, jetzt });
    // alle Spiele des Vereins gelten als in eigener Halle
    const halle = (await testDb.select({ h: schema.ligaSpiele.halleName }).from(schema.ligaSpiele).limit(1))[0]?.h;
    await testDb.update(schema.vereine).set({ eigeneHallenNamen: halle ?? "x" }).where(eq(schema.vereine.id, vereinId));
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.ligaGruppen);
    await pool.end();
  });

  const termineDesVereins = () => testDb.select().from(schema.termine).where(eq(schema.termine.vereinId, vereinId));

  it("legt künftige Heimspiele still an, ändert nichts Bestehendes, idempotent", async () => {
    const { uebernehmeLigaSpiele } = await import("./liga-uebernahme");
    const { berechneHallenplanAbgleich } = await import("./hallenplan-abgleich-laden");
    const vorher = (await berechneHallenplanAbgleich()).find((b) => b.vereinId === vereinId)!;
    const erwartet = vorher.trockenlauf.neuAnzulegenGesamt;
    expect(erwartet).toBeGreaterThan(0);

    // ein bestehender Hallenplan-Termin mit Dienst — muss unangetastet bleiben
    const [alt] = await testDb
      .insert(schema.termine)
      .values({ vereinId, typ: "rundenspiel", quelle: "rundenspiel_import", start: new Date("2030-01-01T10:00:00Z"), ort: "Irgendwo", icsUid: "rundenspiel:99:A:B:1", heimMannschaftName: "A", auswaertsMannschaftName: "B", pflichtspiel: true })
      .returning();
    await testDb.insert(schema.terminZuordnungen).values({ terminId: alt.id, externerName: "Extern", funktionstraegerTyp: "zeitnehmer", quelle: "zugeordnet_durch_admin" });

    const r1 = await uebernehmeLigaSpiele(vereinId, "test", new Date("2020-01-01T00:00:00Z"));
    expect(r1.angelegt).toBe(erwartet);
    expect(r1.doppelteEntfernt).toBe(0);
    expect(r1.zuordnungenVorher).toBe(r1.zuordnungenNachher);
    expect(mailSpy).not.toHaveBeenCalled();

    const nachher = await termineDesVereins();
    expect(nachher).toHaveLength(1 + erwartet);
    const neu = nachher.filter((t) => t.icsUid?.startsWith("liga:"));
    expect(neu).toHaveLength(erwartet);
    expect(neu.every((t) => t.ligaSpielId && t.typ === "rundenspiel")).toBe(true);
    // bestehender Termin samt Dienst unverändert
    expect(nachher.find((t) => t.id === alt.id)).toEqual(alt);
    expect(await testDb.select().from(schema.terminZuordnungen).where(eq(schema.terminZuordnungen.terminId, alt.id))).toHaveLength(1);

    // idempotent: zweiter Lauf legt nichts mehr an
    const r2 = await uebernehmeLigaSpiele(vereinId, "test", new Date("2020-01-01T00:00:00Z"));
    expect(r2.angelegt).toBe(0);
    expect(await termineDesVereins()).toHaveLength(1 + erwartet);
  });

  it("entfernt einen leeren eigenen Doppelgänger, wenn der Hallenplan das Spiel nachliefert; Doppelgänger mit Dienst bleibt", async () => {
    const { uebernehmeLigaSpiele } = await import("./liga-uebernahme");
    const eigene = (await termineDesVereins()).filter((t) => t.icsUid?.startsWith("liga:"));
    const [a, b] = eigene;
    // Hallenplan-"Zwillinge" zu a und b
    const zwilling = (t: typeof a) =>
      testDb
        .insert(schema.termine)
        .values({ vereinId, typ: "rundenspiel", quelle: "rundenspiel_import", start: t.start, ort: t.ort, icsUid: `rundenspiel:1:${t.heimMannschaftName}:${t.auswaertsMannschaftName}:7`, heimMannschaftName: t.heimMannschaftName, auswaertsMannschaftName: t.auswaertsMannschaftName, kategorie: t.kategorie, pflichtspiel: true })
        .returning();
    await zwilling(a);
    await zwilling(b);
    await testDb.insert(schema.terminZuordnungen).values({ terminId: b.id, externerName: "Dienst", funktionstraegerTyp: "zeitnehmer", quelle: "zugeordnet_durch_admin" });

    const r = await uebernehmeLigaSpiele(vereinId, "test", new Date("2020-01-01T00:00:00Z"));
    expect(r.doppelteEntfernt).toBe(1);
    expect(r.doppelteMitDiensten).toBe(1);
    const ids = (await termineDesVereins()).map((t) => t.id);
    expect(ids).not.toContain(a.id);
    expect(ids).toContain(b.id);
    expect(await testDb.select().from(schema.terminZuordnungen).where(and(eq(schema.terminZuordnungen.terminId, b.id)))).toHaveLength(1);
    expect(mailSpy).not.toHaveBeenCalled();
    void ligaVereinId;
  });
});
