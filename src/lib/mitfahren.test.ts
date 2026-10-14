// Integrationstest: Mitfahren über die öffentliche Eintragung (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const mailSpy = vi.fn();
const appPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://unused" });
const appDb = drizzle(appPool, { schema });
vi.mock("@/db", () => ({
  db: appDb,
  withTenant: <T,>(vId: string, callback: (tx: typeof appDb) => Promise<T>) =>
    appDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_verein_id', ${vId}, true)`);
      return callback(tx as unknown as typeof appDb);
    }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/mailer", () => ({ sendMail: (...a: unknown[]) => mailSpy(...a) }));

describe.skipIf(!ADMIN_URL)("Mitfahren (Postgres)", () => {
  const vereinId = randomUUID();
  const fremdVereinId = randomUUID();
  let fahrtId: string;
  let ohnePlaetzeId: string;

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values([
      { id: vereinId, name: "TSV Mitfahren" },
      { id: fremdVereinId, name: "Fremd" },
    ]);
    const [fahrer] = await testDb
      .insert(schema.users)
      .values({ email: `fahrer-${randomUUID()}@example.test`, name: "Jan Fahrer", vereinId })
      .returning({ id: schema.users.id });
    const [dienst] = await testDb
      .insert(schema.dienstArten)
      .values({ vereinId, name: "Fahrer", bedarfAuswaerts: 2, fahrgemeinschaft: true })
      .returning({ id: schema.dienstArten.id });
    const [termin] = await testDb
      .insert(schema.termine)
      .values({ vereinId, typ: "auswaertsspiel", quelle: "manuell", start: new Date(Date.now() + 5 * 86_400_000), beschreibung: "Gegner - TSV" })
      .returning({ id: schema.termine.id });
    const zs = await testDb
      .insert(schema.terminZuordnungen)
      .values([
        { terminId: termin.id, userId: fahrer.id, funktionstraegerTyp: "eigener_dienst", dienstArtId: dienst.id, quelle: "selbst_angemeldet", plaetze: 2 },
        { terminId: termin.id, externerName: "Oma", funktionstraegerTyp: "eigener_dienst", dienstArtId: dienst.id, quelle: "selbst_eingetragen_oeffentlich" },
      ])
      .returning({ id: schema.terminZuordnungen.id });
    fahrtId = zs[0].id;
    ohnePlaetzeId = zs[1].id;
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, fremdVereinId));
    await pool.end();
    await appPool.end();
  });
  beforeEach(() => mailSpy.mockClear());

  it("zeigt nur Fahrten mit freien Plätzen, ohne Mitfahrer-Namen", async () => {
    const { ladeMitfahrAngebote } = await import("./mitfahren");
    const angebote = await ladeMitfahrAngebote(vereinId);
    expect(angebote).toHaveLength(1);
    expect(angebote[0].fahrten).toEqual([{ zuordnungId: fahrtId, fahrer: "Jan Fahrer", frei: 2, hinweis: null }]);
  });

  it("trägt bis zur Platzzahl ein, informiert den Fahrer, lehnt Doppelte, Volle und Fremde ab", async () => {
    const { mitfahrenEintragen, ladeMitfahrAngebote } = await import("./mitfahren");
    expect(await mitfahrenEintragen(vereinId, fahrtId, "Lena")).toBeNull();
    expect(mailSpy).toHaveBeenCalledTimes(1);
    expect(String(mailSpy.mock.calls[0][1])).toContain("Lena");
    expect(await mitfahrenEintragen(vereinId, fahrtId, " lena ")).toMatch(/schon mit/);
    expect(await mitfahrenEintragen(vereinId, fahrtId, "Paul")).toBeNull();
    expect(await mitfahrenEintragen(vereinId, fahrtId, "Mia")).toMatch(/kein Platz/);
    expect(await mitfahrenEintragen(vereinId, ohnePlaetzeId, "Mia")).toMatch(/kein Platz/);
    expect(await mitfahrenEintragen(fremdVereinId, fahrtId, "Mia")).toMatch(/nicht/);
    expect(await mitfahrenEintragen(vereinId, fahrtId, "  ")).toMatch(/Namen/);
    expect(await ladeMitfahrAngebote(vereinId)).toEqual([]);
  });
});
