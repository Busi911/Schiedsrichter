// Echter Import für TSF Heuchelheim auf einem GitHub-Runner (freies Internet):
// nuLiga (HHV, Club 69723) UND handball.net (Club 18rmntb) in eine
// Wegwerf-Postgres-Instanz, danach eine Zusammenfassung ins Log. Zeigt, wie
// der Sync mit echten Daten umgeht (Meldungen, Mannschaften, Spiele, Tabellen).
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "@/lib/nuliga/sync";
import { synchronisiereAlleQuellen } from "@/lib/liga-sync-quellen";

const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const db = drizzle(pool, { schema });
mkdirSync("out/html", { recursive: true });

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));
let letzter = 0;
async function gedrosselt(ms: number) {
  const w = letzter + ms - Date.now();
  if (w > 0) await warte(w);
  letzter = Date.now();
}

const holeHtml = async (url: string) => {
  await gedrosselt(1000);
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Handballerpate/1.0 (Vereinsseiten; Abruf mit Zustimmung des HHV)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "de-DE,de;q=0.9",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  const name = new URL(url).searchParams.get("group") ?? new URL(url).searchParams.get("teamtable") ?? "x";
  writeFileSync(
    `out/html/${new URL(url).pathname.split("/").pop()}-${name}-${createHash("md5").update(url).digest("hex").slice(0, 6)}.html`,
    text
  );
  return text;
};

const BASIS = "https://www.handball.net";
const holeJson = async (pfad: string) => {
  await gedrosselt(500);
  const r = await fetch(BASIS + pfad, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Handballerpate/1.0; Vereinsseiten; Abruf mit Zustimmung des DHB)",
      Accept: "application/json",
      Origin: BASIS,
      Referer: `${BASIS}/`,
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  if (pfad.includes("/teams?club_id") || pfad.includes("/competitions")) {
    console.log(`HNET ${pfad}\n   ${JSON.stringify(json).slice(0, 700)}`);
  }
  return json;
};

async function main() {
  const vereinId = crypto.randomUUID();
  await db.insert(schema.vereine).values({ id: vereinId, name: "TSF Heuchelheim" });
  const { id } = await legeLigaVereinAn(db, {
    vereinId,
    nuligaClubId: "69723",
    handballNetClubId: "18rmntb",
    name: "TSF Heuchelheim",
  });

  for (let runde = 1; runde <= 12; runde++) {
    const t0 = Date.now();
    const r = await synchronisiereAlleQuellen(id, { db, holeHtml, holeJson, frist: Date.now() + 100_000 });
    console.log(`\n=== Runde ${runde}: ${r.status}, neu ${r.neu}, Abrufe ${r.anfragen}, ${Math.round((Date.now() - t0) / 1000)} s, unvollständig=${r.unvollstaendig}`);
    for (const m of r.meldungen) console.log(`  · ${m}`);
    if (!r.unvollstaendig) break;
  }

  console.log("\n=== MANNSCHAFTEN");
  const mannschaften = await db.query.ligaMannschaften.findMany({
    where: eq(schema.ligaMannschaften.ligaVereinId, id),
    orderBy: (m, { asc }) => [asc(m.kategorie), asc(m.altersklasse), asc(m.nummer)],
  });
  for (const m of mannschaften) {
    const teilnahmen = await db
      .select({ t: schema.ligaTeilnahmen, g: schema.ligaGruppen })
      .from(schema.ligaTeilnahmen)
      .innerJoin(schema.ligaGruppen, eq(schema.ligaGruppen.id, schema.ligaTeilnahmen.gruppeId))
      .where(eq(schema.ligaTeilnahmen.mannschaftId, m.id));
    for (const { t, g } of teilnahmen) {
      const spiele = t.nuligaTeamtableId
        ? (await db.query.ligaSpiele.findMany({ where: eq(schema.ligaSpiele.gruppeId, g.id) })).filter(
            (s) => s.heimTeamtableId === t.nuligaTeamtableId || s.gastTeamtableId === t.nuligaTeamtableId
          )
        : [];
      const gespielt = spiele.filter((s) => s.toreHeim !== null).length;
      console.log(
        `${m.aktiv && t.aktiv ? "●" : "○"} ${m.slug.padEnd(22)} ${m.name.padEnd(24)} [${g.quelle}] ${g.ligaName} · ` +
          `Platz ${t.rang ?? "?"} · Teamtable ${t.nuligaTeamtableId ?? "—"} · ${spiele.length} Spiele (${gespielt} mit Ergebnis)`
      );
    }
  }

  const zurueck = await db.query.ligaTabellenzeilen.findMany({
    where: eq(schema.ligaTabellenzeilen.zurueckgezogen, true),
  });
  console.log(`\nZurückgezogene Tabellenzeilen: ${zurueck.map((z) => z.name).join("; ") || "keine"}`);
  console.log(`Gruppen gesamt: ${(await db.query.ligaGruppen.findMany()).length}, Spiele gesamt: ${(await db.query.ligaSpiele.findMany()).length}`);
  await pool.end();

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
