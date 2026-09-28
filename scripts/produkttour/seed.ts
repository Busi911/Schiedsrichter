// Seed-Skript für eine WEGWERFBARE lokale Demo-Datenbank — erzeugt einen
// fiktiven Verein mit Beispieldaten, ausschließlich um die Screenshots für
// die Produkttour auf der Startseite (src/app/page.tsx, PRODUKTTOUR) zu
// erzeugen. Siehe README.md#produkttour-screenshots-neu-erzeugen.
//
// NIEMALS gegen eine echte/produktive Datenbank laufen lassen — der
// erzeugte Verein zählt sonst live gegen das Beta-Vereinslimit
// (systemEinstellungen.betaVereinLimit). Setzt außerdem voraus, dass
// DATABASE_URL/DATABASE_ADMIN_URL auf eine lokale Wegwerf-Postgres-Instanz
// zeigen (siehe scripts/produkttour/README.md), NICHT auf Neon.
import "dotenv/config";
import { withTenant } from "../../src/db";
import {
  hallen,
  mannschaften,
  termine,
  terminZuordnungen,
  trainingszeiten,
  users,
  funktionstraegerRollen,
} from "../../src/db/schema";
import { hashePasswort } from "../../src/lib/passwort";

function tageAb(heute: Date, tage: number, stunde: number, minute = 0) {
  const d = new Date(heute);
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, minute, 0, 0);
  return d;
}

async function main() {
  const heute = new Date();
  const vereinId = crypto.randomUUID();

  await withTenant(vereinId, async (tx) => {
    await tx
      .insert((await import("../../src/db/schema")).vereine)
      .values({
        id: vereinId,
        name: "TSV Musterstadt Handball",
        adresse: "Sporthallenweg 3, 65183 Musterstadt",
        avvAkzeptiertAm: heute,
        avvAkzeptiertVersion: "1.0",
        avvAkzeptiertVonName: "Anna Admin",
        avvAkzeptiertVonEmail: "admin@demo.handballerpate.de",
        testspielOrdnerBedarf: 2,
        testspielKioskdienstBedarf: 1,
        turnierOrdnerBedarf: 3,
        turnierKioskdienstBedarf: 2,
        rundenspielOrdnerBedarf: 2,
        rundenspielKioskdienstBedarf: 1,
        rundenspielZeitnehmerBedarf: 1,
      })
      .returning();

    const adminPw = await hashePasswort("Demo-Passwort-1!");
    const [admin] = await tx
      .insert(users)
      .values({
        email: "admin@demo.handballerpate.de",
        name: "Anna Admin",
        vereinId,
        istAdmin: true,
        passwordHash: adminPw,
        letzterLoginAm: heute,
      })
      .returning();

    const funktionstraegerDaten: {
      name: string;
      email: string;
      typ: "schiedsrichter" | "zeitnehmer" | "sekretaer" | "trainer" | "ordner" | "kioskdienst" | "kassierer";
    }[] = [
      { name: "Thomas Bauer", email: "thomas.bauer@demo.handballerpate.de", typ: "schiedsrichter" },
      { name: "Julia Becker", email: "julia.becker@demo.handballerpate.de", typ: "schiedsrichter" },
      { name: "Markus Fischer", email: "markus.fischer@demo.handballerpate.de", typ: "schiedsrichter" },
      { name: "Laura Hoffmann", email: "laura.hoffmann@demo.handballerpate.de", typ: "zeitnehmer" },
      { name: "Sven Wagner", email: "sven.wagner@demo.handballerpate.de", typ: "sekretaer" },
      { name: "Nina Schulz", email: "nina.schulz@demo.handballerpate.de", typ: "ordner" },
      { name: "Paul Richter", email: "paul.richter@demo.handballerpate.de", typ: "kioskdienst" },
      { name: "Katrin Weber", email: "katrin.weber@demo.handballerpate.de", typ: "kassierer" },
      { name: "Michael Schäfer", email: "michael.schaefer@demo.handballerpate.de", typ: "trainer" },
      { name: "Sabine Klein", email: "sabine.klein@demo.handballerpate.de", typ: "trainer" },
    ];

    const angelegteUser: Record<string, string> = { admin: admin.id };
    for (const f of funktionstraegerDaten) {
      const [u] = await tx
        .insert(users)
        .values({ email: f.email, name: f.name, vereinId, letzterLoginAm: heute })
        .returning();
      angelegteUser[f.email] = u.id;
    }

    const mannschaftsDaten = [
      { name: "1. Herren", altersklasse: "Herren" },
      { name: "1. Damen", altersklasse: "Damen" },
      { name: "männliche B-Jugend", altersklasse: "mB" },
      { name: "weibliche C-Jugend", altersklasse: "wC" },
    ];
    const angelegteMannschaften = [];
    for (const m of mannschaftsDaten) {
      const [row] = await tx.insert(mannschaften).values({ vereinId, ...m }).returning();
      angelegteMannschaften.push(row);
    }

    // Trainer den Mannschaften zuordnen
    await tx.insert(funktionstraegerRollen).values([
      {
        userId: angelegteUser["michael.schaefer@demo.handballerpate.de"],
        typ: "trainer",
        mannschaftId: angelegteMannschaften[0].id,
      },
      {
        userId: angelegteUser["sabine.klein@demo.handballerpate.de"],
        typ: "trainer",
        mannschaftId: angelegteMannschaften[1].id,
      },
      {
        userId: angelegteUser["thomas.bauer@demo.handballerpate.de"],
        typ: "schiedsrichter",
        lizenzGueltigBis: tageAb(heute, 200, 0),
      },
      {
        userId: angelegteUser["julia.becker@demo.handballerpate.de"],
        typ: "schiedsrichter",
        lizenzGueltigBis: tageAb(heute, 25, 0),
      },
      {
        userId: angelegteUser["markus.fischer@demo.handballerpate.de"],
        typ: "schiedsrichter",
        lizenzGueltigBis: tageAb(heute, 400, 0),
      },
      { userId: angelegteUser["laura.hoffmann@demo.handballerpate.de"], typ: "zeitnehmer" },
      { userId: angelegteUser["sven.wagner@demo.handballerpate.de"], typ: "sekretaer" },
      { userId: angelegteUser["nina.schulz@demo.handballerpate.de"], typ: "ordner" },
      { userId: angelegteUser["paul.richter@demo.handballerpate.de"], typ: "kioskdienst" },
      { userId: angelegteUser["katrin.weber@demo.handballerpate.de"], typ: "kassierer" },
      // Anna Admin ist zusätzlich Schiedsrichterwart, damit der Wart-Bereich
      // im Profil sichtbar ist.
      { userId: admin.id, typ: "schiedsrichterwart" },
      { userId: admin.id, typ: "zeitnehmerwart" },
      { userId: admin.id, typ: "ordnerwart" },
    ]);

    const [halle1] = await tx
      .insert(hallen)
      .values({ vereinId, name: "Sporthalle Musterstadt", abteilAnzahl: 2, abteil1Name: "Halle A", abteil2Name: "Halle B" })
      .returning();
    const [halle2] = await tx.insert(hallen).values({ vereinId, name: "Turnhalle Schulzentrum" }).returning();

    await tx.insert(trainingszeiten).values([
      {
        vereinId,
        mannschaftId: angelegteMannschaften[0].id,
        halleId: halle1.id,
        wochentag: 1,
        startMinuten: 18 * 60 + 30,
        endMinuten: 20 * 60,
        farbe: "#3b82f6",
        abteilNummer: 1,
      },
      {
        vereinId,
        mannschaftId: angelegteMannschaften[1].id,
        halleId: halle1.id,
        wochentag: 3,
        startMinuten: 19 * 60,
        endMinuten: 20 * 60 + 30,
        farbe: "#ec4899",
        abteilNummer: 2,
      },
      {
        vereinId,
        mannschaftId: angelegteMannschaften[2].id,
        halleId: halle2.id,
        wochentag: 2,
        startMinuten: 17 * 60,
        endMinuten: 18 * 60 + 30,
        farbe: "#22c55e",
      },
      {
        vereinId,
        mannschaftId: angelegteMannschaften[3].id,
        halleId: halle2.id,
        wochentag: 4,
        startMinuten: 16 * 60,
        endMinuten: 17 * 60 + 15,
        farbe: "#f59e0b",
      },
    ]);

    // Termine: Vergangenheit + Zukunft, unterschiedliche Typen
    const terminDaten = [
      {
        typ: "rundenspiel" as const,
        start: tageAb(heute, 4, 15, 0),
        ende: tageAb(heute, 4, 16, 30),
        ort: "Sporthalle Musterstadt",
        beschreibung: "TSV Musterstadt - HSG Nachbarstadt",
        mannschaftId: angelegteMannschaften[0].id,
        pflichtspiel: true,
        heimMannschaftName: "TSV Musterstadt",
        auswaertsMannschaftName: "HSG Nachbarstadt",
      },
      {
        typ: "rundenspiel" as const,
        start: tageAb(heute, 6, 17, 0),
        ende: tageAb(heute, 6, 18, 30),
        ort: "Sporthalle Musterstadt",
        beschreibung: "TSV Musterstadt - TV Bergheim",
        mannschaftId: angelegteMannschaften[1].id,
        pflichtspiel: true,
        heimMannschaftName: "TSV Musterstadt",
        auswaertsMannschaftName: "TV Bergheim",
      },
      {
        typ: "testspiel" as const,
        start: tageAb(heute, 9, 11, 0),
        ende: tageAb(heute, 9, 12, 30),
        ort: "Turnhalle Schulzentrum",
        beschreibung: "Testspiel gegen SG Talblick",
        mannschaftId: angelegteMannschaften[2].id,
      },
      {
        typ: "turnier" as const,
        start: tageAb(heute, 14, 9, 0),
        ende: tageAb(heute, 14, 17, 0),
        ort: "Sporthalle Musterstadt",
        beschreibung: "Jugend-Hallenturnier",
        mannschaftId: angelegteMannschaften[3].id,
      },
      {
        typ: "spiel_ics" as const,
        start: tageAb(heute, 2, 19, 0),
        ende: tageAb(heute, 2, 20, 30),
        ort: "Halle Bergheim",
        beschreibung: "TV Bergheim - SG Waldstadt (Verbandsspiel)",
        icsSchiedsrichterId: angelegteUser["thomas.bauer@demo.handballerpate.de"],
      },
      {
        typ: "rundenspiel" as const,
        start: tageAb(heute, -3, 15, 0),
        ende: tageAb(heute, -3, 16, 30),
        ort: "Sporthalle Musterstadt",
        beschreibung: "TSV Musterstadt - SG Waldstadt",
        mannschaftId: angelegteMannschaften[0].id,
        pflichtspiel: true,
        heimMannschaftName: "TSV Musterstadt",
        auswaertsMannschaftName: "SG Waldstadt",
        ergebnisHeim: 28,
        ergebnisAuswaerts: 24,
      },
    ];

    const angelegteTermine = [];
    for (const t of terminDaten) {
      const [row] = await tx
        .insert(termine)
        .values({
          vereinId,
          quelle: t.typ === "spiel_ics" ? "ics_feed" : "manuell",
          erstelltVon: admin.id,
          ...t,
        })
        .returning();
      angelegteTermine.push(row);
    }

    // Zuordnungen: Schiedsrichter/Zeitnehmer/Ordner zu den Terminen
    await tx.insert(terminZuordnungen).values([
      {
        terminId: angelegteTermine[0].id,
        userId: angelegteUser["thomas.bauer@demo.handballerpate.de"],
        funktionstraegerTyp: "schiedsrichter",
        quelle: "zugeordnet_durch_admin",
      },
      {
        terminId: angelegteTermine[0].id,
        userId: angelegteUser["julia.becker@demo.handballerpate.de"],
        funktionstraegerTyp: "schiedsrichter",
        quelle: "zugeordnet_durch_admin",
      },
      {
        terminId: angelegteTermine[0].id,
        userId: angelegteUser["laura.hoffmann@demo.handballerpate.de"],
        funktionstraegerTyp: "zeitnehmer",
        quelle: "zugeordnet_durch_admin",
      },
      {
        terminId: angelegteTermine[0].id,
        userId: angelegteUser["nina.schulz@demo.handballerpate.de"],
        funktionstraegerTyp: "ordner",
        quelle: "selbst_angemeldet",
      },
      {
        terminId: angelegteTermine[1].id,
        userId: angelegteUser["markus.fischer@demo.handballerpate.de"],
        funktionstraegerTyp: "schiedsrichter",
        quelle: "zugeordnet_durch_admin",
      },
      {
        terminId: angelegteTermine[3].id,
        userId: angelegteUser["paul.richter@demo.handballerpate.de"],
        funktionstraegerTyp: "kioskdienst",
        quelle: "zugeordnet_durch_admin",
      },
      {
        terminId: angelegteTermine[5].id,
        userId: angelegteUser["thomas.bauer@demo.handballerpate.de"],
        funktionstraegerTyp: "schiedsrichter",
        quelle: "zugeordnet_durch_admin",
      },
    ]);

    console.log("Demo-Verein-ID:", vereinId);
    console.log("Admin-Login: admin@demo.handballerpate.de / Demo-Passwort-1!");
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
