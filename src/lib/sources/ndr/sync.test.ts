// Sync der Quelle ndr.de gegen ein echtes Postgres (nur mit TEST_DATABASE_ADMIN_URL). HTTP ist durch die nachgebaute Fixture ersetzt.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { verknuepfeExternesTeam } from "../identitaet";
import { synchronisiereSportDe } from "../sportde/sync";
import { ndrSyncProfil } from "./sync-profil";

const HBL2 = readFileSync(path.join(__dirname, "__fixtures__", "hbl2-saison.html"), "utf8");
const jetzt = new Date("2026-10-05T12:00:00Z");
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

describe.skipIf(!ADMIN_URL)("ndr-Sync (Postgres)", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const db = drizzle(pool, { schema });
  const vereinId = randomUUID();
  let ligaVereinId: string;
  let aufrufe: string[] = [];
  const hole = async (pfad: string) => {
    aufrufe.push(pfad);
    return HBL2;
  };
  const lauf = (extra: { nurTabelle?: boolean; maxSeiten?: number } = {}) =>
    synchronisiereSportDe({ db, hole, liga: "hbl2", saison: "2026/27", jetzt, profil: ndrSyncProfil(2026), maxSeiten: 8, ...extra });
  const raeumeAuf = async () => {
    await db.delete(schema.ligaVereine);
    await db.delete(schema.ligaGruppen);
    await db.delete(schema.ligaQuellenAbrufe);
  };
  beforeAll(async () => {
    await raeumeAuf();
    await db.insert(schema.vereine).values({ id: vereinId, name: "TuSEM Essen" });
    ligaVereinId = (await legeLigaVereinAn(db, { vereinId, nuligaClubId: "424243", name: "TuSEM Essen" })).id;
  });
  afterAll(async () => {
    await db.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await raeumeAuf();
    await pool.end();
  });

  it("legt Gruppe und Tabelle an, aber ohne Zuordnung keine Spiele und keinen neuen Verein", async () => {
    const r = await lauf({ nurTabelle: true });
    expect(r.status).toBe("erfolgreich");
    const g = (await db.query.ligaGruppen.findFirst({ where: and(eq(schema.ligaGruppen.verband, "NDR"), eq(schema.ligaGruppen.nuligaGroupId, "hbl2:2026/27")) }))!;
    expect(g).toMatchObject({ quelle: "ndr", spielklasse: "2. HBL" });
    const zeilen = await db.select().from(schema.ligaTabellenzeilen).where(eq(schema.ligaTabellenzeilen.gruppeId, g.id));
    expect(zeilen.map((z) => z.nuligaTeamtableId).sort()).toEqual(["name:1-vfl-potsdam", "name:hc-elbflorenz-2006", "name:vfl-eintracht-hagen"]);
    expect(await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id))).toHaveLength(0);
    expect(await db.select().from(schema.ligaVereine)).toHaveLength(1);
  });

  it("mit Zuordnung: Spiele des Teams mit stabilem Schlüssel, Halbzeitstand und Ergebnis; erneuter Lauf ändert nichts", async () => {
    expect(await verknuepfeExternesTeam(db, "ndr", ligaVereinId, { externalId: "name:tusem-essen", name: "TuSEM Essen" })).toEqual({ ok: true });
    aufrufe = [];
    const r = await lauf();
    expect(r.status).not.toBe("fehler");
    expect(aufrufe.length).toBeGreaterThan(0);
    const g = (await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.verband, "NDR") }))!;
    const spiele = await db.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.gruppeId, g.id));
    expect(spiele).toHaveLength(1);
    expect(spiele[0]).toMatchObject({ spielcode: "hbl2-2026-27-md6-tusem-essen_dhfk-leipzig", quelle: "ndr", toreHeim: 32, toreGast: 35, halbzeitHeim: 14, halbzeitGast: 19, ergebnisBestaetigt: true, status: "gespielt", spieltag: 6, berichtUrl: null });
    const zweiter = await lauf();
    expect(zweiter.aktualisiert).toBe(0);
    // sport.de-Daten bleiben getrennt
    expect(await db.query.ligaGruppen.findFirst({ where: eq(schema.ligaGruppen.verband, "SPORTDE") })).toBeUndefined();
  });
});
