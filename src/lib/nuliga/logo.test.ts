// Integrationstest der Logo-Übernahme gegen ein ECHTES Postgres (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "./sync";
import { uebernehmeNuligaLogo } from "./logo";

vi.mock("server-only", () => ({}));

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });

const bild = (farbe: string) =>
  sharp({ create: { width: 64, height: 40, channels: 3, background: farbe } }).png().toBuffer();

describe.skipIf(!ADMIN_URL)("nuLiga-Logo (Postgres)", () => {
  const vereinId = randomUUID();
  let ligaVereinId: string;
  const pfad = "/cgi-bin/WebObjects/nuLigaHBDE.woa/wr?wodata=123";
  const urls: string[] = [];
  let aktuell: Buffer;
  const holeBild = async (url: string) => {
    urls.push(url);
    return { daten: aktuell, contentType: "image/png" };
  };
  const logo = () => testDb.query.ligaVereinLogos.findFirst({ where: eq(schema.ligaVereinLogos.ligaVereinId, ligaVereinId) });
  const verein = () => testDb.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.id, ligaVereinId) });

  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine).where(eq(schema.ligaVereine.nuligaClubId, "76446"));
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "HSG Linden" });
    ligaVereinId = (await legeLigaVereinAn(testDb, { vereinId, nuligaClubId: "76446", name: "HSG Linden" })).id;
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await pool.end();
  });

  it("holt das Logo von der absoluten nuLiga-URL, normalisiert es und merkt Herkunft und Hash", async () => {
    aktuell = await bild("#cc0000");
    const r = await uebernehmeNuligaLogo({ db: testDb, ligaVereinId, logoPfad: pfad, holeBild });
    expect(r.status).toBe("neu");
    expect(urls).toEqual(["https://hhv-handball.liga.nu" + pfad]);
    const l = (await logo())!;
    expect(l.quelle).toBe("nuliga");
    expect(l.quellHash).toHaveLength(64);
    // Original unverändert: gleiche Bytes, gleiche Proportion (kein 512er-Quadrat), MIME aus den Magic Bytes
    expect(Buffer.compare(l.png, aktuell)).toBe(0);
    expect(l.mime).toBe("image/png");
    expect(await sharp(l.png).metadata()).toMatchObject({ width: 64, height: 40 });
    expect((await verein())!.logoGeprueftAm).not.toBeNull();
  });

  it("lädt bei gleicher Originaldatei nichts neu hoch (Cache-Buster bleibt)", async () => {
    const vorher = (await logo())!.aktualisiertAm;
    const r = await uebernehmeNuligaLogo({ db: testDb, ligaVereinId, logoPfad: pfad + "9", holeBild, jetzt: new Date(Date.now() + 8 * 864e5) });
    expect(r.status).toBe("unveraendert");
    expect((await logo())!.aktualisiertAm.getTime()).toBe(vorher.getTime());
  });

  it("ersetzt das Logo, wenn sich das Bild geändert hat", async () => {
    aktuell = await bild("#0000cc");
    const vorher = (await logo())!;
    const r = await uebernehmeNuligaLogo({ db: testDb, ligaVereinId, logoPfad: pfad, holeBild, jetzt: new Date(Date.now() + 9 * 864e5) });
    expect(r.status).toBe("aktualisiert");
    const nachher = (await logo())!;
    expect(nachher.quellHash).not.toBe(vorher.quellHash);
    expect(Buffer.compare(nachher.png, vorher.png)).not.toBe(0);
  });

  it("meldet Fehler (kein Bild) ohne das vorhandene Logo anzufassen", async () => {
    const vorher = (await logo())!.quellHash;
    aktuell = Buffer.from("<html>kein Bild</html>");
    const r = await uebernehmeNuligaLogo({ db: testDb, ligaVereinId, logoPfad: pfad, holeBild });
    expect(r.status).toBe("fehler");
    expect((await logo())!.quellHash).toBe(vorher);
  });

  it("kein Logo bei nuLiga: nichts geändert, Prüfung vermerkt", async () => {
    const r = await uebernehmeNuligaLogo({ db: testDb, ligaVereinId, logoPfad: null, holeBild });
    expect(r.status).toBe("kein_logo");
  });

  it("überschreibt nie ein vom Verein hochgeladenes Logo und respektiert 'entfernt'", async () => {
    aktuell = await bild("#00cc00");
    await testDb.update(schema.ligaVereinLogos).set({ quelle: "upload" }).where(eq(schema.ligaVereinLogos.ligaVereinId, ligaVereinId));
    const hash = (await logo())!.quellHash;
    expect((await uebernehmeNuligaLogo({ db: testDb, ligaVereinId, logoPfad: pfad, holeBild })).status).toBe("manuell");
    expect((await logo())!.quellHash).toBe(hash);

    await testDb.delete(schema.ligaVereinLogos).where(eq(schema.ligaVereinLogos.ligaVereinId, ligaVereinId));
    await testDb.update(schema.ligaVereine).set({ logoAutoAus: true }).where(eq(schema.ligaVereine.id, ligaVereinId));
    expect((await uebernehmeNuligaLogo({ db: testDb, ligaVereinId, logoPfad: pfad, holeBild })).status).toBe("aus");
    expect(await logo()).toBeUndefined();
  });
});
