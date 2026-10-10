const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_ADMIN_URL,
  });
  await client.connect();

  // 1. Die 8 inaktiven Vereine mit Details
  const res1 = await client.query(`
    SELECT v.id, v.name, v.status, v.tarif,
           v.erstellt_am,
           (SELECT COUNT(*) FROM liga_verein lv WHERE lv.verein_id = v.id) AS liga_count,
           (SELECT COUNT(*) FROM liga_mannschaft lm WHERE lm.verein_id = v.id) AS mannschaften,
           (SELECT COUNT(*) FROM "user" u WHERE u.verein_id = v.id) AS admin_count
    FROM verein v
    WHERE v.status = 'inaktiv'
    ORDER BY v.erstellt_am DESC
  `);
  console.log("=== Inaktive Vereine:", res1.rows.length, "===");
  for (const r of res1.rows) {
    console.log(`  ${r.name} | id=${r.id} | mannschaften=${r.mannschaften} | liga=${r.liga_count} | admins=${r.admin_count} | erstellt=${r.erstellt_am}`);
  }

  // 2. Kontakt-Einträge für diese Vereine (wurden sie angeschrieben?)
  if (res1.rows.length > 0) {
    const ids = res1.rows.map((r) => r.id);
    const res2 = await client.query(`
      SELECT vk.verein_id, v.name AS verein_name,
             vk.ansprache_kanal, vk.ansprache_email, vk.ansprache_gesendet_am,
             vk.angeschrieben_am, vk.followup_gesendet_am, vk.outreach_abgemeldet_am
      FROM verein_kontakt vk
      JOIN verein v ON v.id = vk.verein_id
      WHERE vk.verein_id = ANY($1::uuid[])
    `, [ids]);
    console.log("\n=== Kontakt-Einträge ===");
    if (res2.rows.length === 0) {
      console.log("  Keine Kontakt-Einträge gefunden — wurden nie angeschrieben.");
    } else {
      for (const r of res2.rows) {
        console.log(`  ${r.verein_name} | kanal=${r.ansprache_kanal} | email=${r.ansprache_email} | angeschrieben=${r.angeschrieben_am} | gesendet=${r.ansprache_gesendet_am} | followup=${r.followup_gesendet_am} | abgemeldet=${r.outreach_abgemeldet_am}`);
      }
    }
  }

  // 3. Protokoll-Einträge
  if (res1.rows.length > 0) {
    const ids = res1.rows.map((r) => r.id);
    const res3 = await client.query(`
      SELECT vp.verein_id, v.name AS verein_name, vp.aktion, vp.akteur, vp.zeitpunkt
      FROM verein_protokoll vp
      JOIN verein v ON v.id = vp.verein_id
      WHERE vp.verein_id = ANY($1::uuid[])
      ORDER BY vp.zeitpunkt DESC
    `, [ids]);
    console.log("\n=== Protokoll ===");
    if (res3.rows.length === 0) {
      console.log("  Keine Protokoll-Einträge.");
    } else {
      for (const r of res3.rows) {
        console.log(`  ${r.zeitpunkt} | ${r.verein_name} | ${r.aktion} | ${r.akteur || "-"}`);
      }
    }
  }

  // 4. NuLiga-Index Einträge für diese Vereine (haben sie nuLiga-Daten?)
  if (res1.rows.length > 0) {
    const ids = res1.rows.map((r) => r.id);
    const res4 = await client.query(`
      SELECT nv.name, nv.nuliga_club_id, nv.verband, nv.email_gefunden, nv.website
      FROM nuliga_vereinsindex nv
      WHERE nv.verein_id = ANY($1::uuid[])
        OR nv.name IN (SELECT name FROM verein WHERE id = ANY($1::uuid[]))
    `, [ids]);
    console.log("\n=== nuLiga-Index ===");
    if (res4.rows.length === 0) {
      console.log("  Keine nuLiga-Index-Einträge (weder verknüpft noch per Name gefunden).");
    } else {
      for (const r of res4.rows) {
        console.log(`  ${r.name} | club_id=${r.nuliga_club_id} | verband=${r.verband} | email_gefunden=${r.email_gefunden} | website=${r.website}`);
      }
    }
  }

  await client.end();
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
