import "server-only";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { mannschaften, termine, terminZuordnungen } from "@/db/schema";
import { ermittleUebernahmeBasis } from "@/lib/hallenplan-abgleich-laden";
import { findeMannschaft, type RundenspielEreignis } from "@/lib/rundenspiel-import";
import { parseBerlinDatumZeit } from "@/lib/format";
import { schreibeProtokoll } from "@/lib/treuhand";

// Präfix der icsUid von Terminen, die aus den öffentlichen Liga-Daten entstehen.
// Bewusst NICHT "rundenspiel:" — die Aufräumlogik des Hallenplan-Imports
// (ermittleVerwaisteRundenspielIds) erkennt Termine nur über dieses Präfix und
// fasst diese hier deshalb nie an.
export const LIGA_UID_PRAEFIX = "liga:";

export type UebernahmeErgebnis = {
  angelegt: number;
  uebersprungenOhneZeit: number;
  // Von uns selbst angelegte, leere Termine, deren Spiel inzwischen im Hallenplan
  // steht: der Hallenplan-Termin gewinnt, unser leerer Doppelgänger wird entfernt.
  doppelteEntfernt: number;
  // Doppelgänger mit eingetragenen Diensten: bleiben, werden nur gemeldet.
  doppelteMitDiensten: number;
  zuordnungenVorher: number;
  zuordnungenNachher: number;
};

async function zaehleZuordnungen(vereinId: string): Promise<number> {
  const [z] = await adminDb
    .select({ n: sql<number>`count(*)::int` })
    .from(terminZuordnungen)
    .innerJoin(termine, eq(termine.id, terminZuordnungen.terminId))
    .where(and(eq(termine.vereinId, vereinId), eq(termine.typ, "rundenspiel")));
  return z?.n ?? 0;
}

const heuteBerlin = (jetzt: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt); // YYYY-MM-DD

// Schritt 3 der Zusammenführung: legt für künftige Heimspiele in eigener Halle,
// die im Hallenplan fehlen, einen Termin aus den öffentlichen Liga-Daten an.
// STILL: keine Mail, keine Benachrichtigung. Ändert und löscht keinen
// Hallenplan-Termin und keine Zuordnung (einzige Löschung: ein eigener, leerer
// Doppelgänger). Idempotent — angelegte Termine sind verknüpft, tauchen also
// nicht erneut als "fehlt" auf. Zeit/Ort bestehender Termine bleiben unberührt
// (Verlegungen behandelt weiter der Hallenplan-Import).
export async function uebernehmeLigaSpiele(
  vereinId: string,
  akteur: string,
  jetzt = new Date()
): Promise<UebernahmeErgebnis> {
  const zuordnungenVorher = await zaehleZuordnungen(vereinId);
  const { sichere, neuSpiele } = await ermittleUebernahmeBasis(vereinId);

  // 1) Doppelgänger: ein Spiel, das von mehreren Terminen beansprucht wird,
  // darunter ein eigener "liga:"-Termin.
  const proSpiel = new Map<string, string[]>();
  for (const p of sichere) proSpiel.set(p.spielId, [...(proSpiel.get(p.spielId) ?? []), p.terminId]);
  const mehrfach = [...proSpiel.values()].filter((ids) => ids.length > 1);
  const ligaEigene = mehrfach.length
    ? await adminDb
        .select({ id: termine.id })
        .from(termine)
        .where(
          and(
            eq(termine.vereinId, vereinId),
            like(termine.icsUid, `${LIGA_UID_PRAEFIX}%`),
            inArray(termine.id, mehrfach.flat())
          )
        )
    : [];
  const ligaEigeneIds = new Set(ligaEigene.map((t) => t.id));
  let doppelteEntfernt = 0;
  let doppelteMitDiensten = 0;
  for (const ids of mehrfach) {
    const unsere = ids.filter((id) => ligaEigeneIds.has(id));
    if (unsere.length !== 1 || ids.length < 2) continue; // nur der klare Fall: genau ein eigener + mindestens ein Hallenplan-Termin
    const [z] = await adminDb
      .select({ n: sql<number>`count(*)::int` })
      .from(terminZuordnungen)
      .where(eq(terminZuordnungen.terminId, unsere[0]));
    if ((z?.n ?? 0) > 0) {
      doppelteMitDiensten++;
      continue;
    }
    await adminDb.delete(termine).where(and(eq(termine.id, unsere[0]), eq(termine.vereinId, vereinId)));
    doppelteEntfernt++;
  }

  // 2) Fehlende künftige Heimspiele anlegen.
  const heute = heuteBerlin(jetzt);
  const mannschaftsListe = await adminDb.query.mannschaften.findMany({
    where: eq(mannschaften.vereinId, vereinId),
    orderBy: [asc(mannschaften.name)],
  });
  // Bereits von uns angelegte Termine (unabhängig davon, ob der Abgleich sie
  // wiedererkennt): nie ein zweites Mal für dasselbe Spiel anlegen.
  const vorhandeneUids = new Set(
    (
      await adminDb
        .select({ uid: termine.icsUid })
        .from(termine)
        .where(and(eq(termine.vereinId, vereinId), like(termine.icsUid, `${LIGA_UID_PRAEFIX}%`)))
    ).map((t) => t.uid)
  );
  let angelegt = 0;
  let uebersprungenOhneZeit = 0;
  for (const { spiel, kategorie } of neuSpiele) {
    if (spiel.datum < heute) continue;
    if (vorhandeneUids.has(`${LIGA_UID_PRAEFIX}${spiel.id}`)) continue;
    const start = spiel.beginn ?? (spiel.uhrzeit ? parseBerlinDatumZeit(`${spiel.datum}T${spiel.uhrzeit}`) : null);
    if (!start || Number.isNaN(start.getTime())) {
      uebersprungenOhneZeit++;
      continue;
    }
    const mannschaftId = findeMannschaft(
      { heimMannschaft: spiel.heimName, auswaertsMannschaft: spiel.gastName, kategorie } as RundenspielEreignis,
      mannschaftsListe
    );
    const gefuegt = await adminDb
      .insert(termine)
      .values({
        vereinId,
        typ: "rundenspiel",
        quelle: "rundenspiel_import",
        start,
        ort: spiel.halleName,
        beschreibung: `${spiel.heimName} – ${spiel.gastName}`,
        mannschaftId,
        icsUid: `${LIGA_UID_PRAEFIX}${spiel.id}`,
        heimMannschaftName: spiel.heimName,
        auswaertsMannschaftName: spiel.gastName,
        kategorie,
        pflichtspiel: !spiel.istFreundschaft,
        ligaSpielId: spiel.id,
      })
      .returning({ id: termine.id });
    angelegt += gefuegt.length;
  }

  const zuordnungenNachher = await zaehleZuordnungen(vereinId);
  await schreibeProtokoll(
    vereinId,
    "liga_uebernommen",
    akteur,
    `${angelegt} Termine angelegt, ${doppelteEntfernt} leere Doppelgänger entfernt, ${doppelteMitDiensten} Doppelgänger mit Diensten gemeldet, ${uebersprungenOhneZeit} ohne Uhrzeit übersprungen; Zuordnungen vorher ${zuordnungenVorher}, nachher ${zuordnungenNachher}`
  );
  return { angelegt, uebersprungenOhneZeit, doppelteEntfernt, doppelteMitDiensten, zuordnungenVorher, zuordnungenNachher };
}
