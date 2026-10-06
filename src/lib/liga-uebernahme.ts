import "server-only";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine, mannschaften, termine, terminZuordnungen, vereine } from "@/db/schema";
import { ermittleUebernahmeBasis } from "@/lib/hallenplan-abgleich-laden";
import { uebernehmeAenderungen } from "@/lib/liga-aenderungen";
import { findeMannschaft, type RundenspielEreignis } from "@/lib/rundenspiel-import";
import { parseBerlinDatumZeit } from "@/lib/format";
import { schreibeProtokoll } from "@/lib/treuhand";
import { baueMannschaftsAufloeser, legeVereinsMannschaftenAn, verknuepfeTermineMitMannschaften } from "@/lib/nuliga/mannschaften-anlegen";

// Präfix der icsUid von Terminen, die aus den öffentlichen Liga-Daten entstehen.
// Bewusst NICHT "rundenspiel:" — die Aufräumlogik des Hallenplan-Imports
// (ermittleVerwaisteRundenspielIds) erkennt Termine nur über dieses Präfix und
// fasst diese hier deshalb nie an.
export const LIGA_UID_PRAEFIX = "liga:";

export const CRON_AKTEUR = "automatisch (Cron)";

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
  // Mannschaften des Vereins aus den Liga-Mannschaften anlegen (nur für Vereine ohne eigene, unverknüpfte Mannschaften) und
  // bereits angelegte Liga-Termine ohne Mannschaft nachträglich zuordnen — VOR dem Anlegen neuer Termine.
  await legeVereinsMannschaftenAn(adminDb, vereinId);
  await verknuepfeTermineMitMannschaften(adminDb, vereinId);
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
  const mannschaftAufloeser = await baueMannschaftsAufloeser(adminDb, vereinId);
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
    // Exakt über die Teamtable-ID der verknüpften Liga-Mannschaft, sonst wie bisher über den Namen.
    const mannschaftId =
      mannschaftAufloeser(spiel) ??
      findeMannschaft(
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
  // Der stündliche Cron läuft meist ohne Änderung — dann kein Protokolleintrag.
  if (akteur !== CRON_AKTEUR || angelegt + doppelteEntfernt + doppelteMitDiensten > 0) {
    await schreibeProtokoll(
      vereinId,
      "liga_uebernommen",
      akteur,
      `${angelegt} Termine angelegt, ${doppelteEntfernt} leere Doppelgänger entfernt, ${doppelteMitDiensten} Doppelgänger mit Diensten gemeldet, ${uebersprungenOhneZeit} ohne Uhrzeit übersprungen; Zuordnungen vorher ${zuordnungenVorher}, nachher ${zuordnungenNachher}`
    );
  }
  return { angelegt, uebersprungenOhneZeit, doppelteEntfernt, doppelteMitDiensten, zuordnungenVorher, zuordnungenNachher };
}

// Vom eigenen Übernahme-Cron aufgerufen (/api/cron/liga-uebernahme): alle Vereine mit
// eingeschalteter Übernahme (Default aus), die am längsten nicht geprüften zuerst.
// `frist` (ms-Zeitstempel) begrenzt die Laufzeit — was liegen bleibt, kommt im
// nächsten Lauf als Erstes dran. Fehler eines Vereins stoppen die anderen nicht.
export async function uebernehmeFuerAktiveVereine(
  opt: { nurLigaVereinIds?: string[]; jetzt?: Date; frist?: number } = {}
) {
  const aktive = await adminDb
    .select({ vereinId: vereine.id, ligaVereinId: ligaVereine.id })
    .from(vereine)
    .innerJoin(ligaVereine, eq(ligaVereine.vereinId, vereine.id))
    .where(eq(vereine.ligaUebernahmeAktiv, true))
    .orderBy(sql`${vereine.ligaUebernahmeGeprueftAm} asc nulls first`);
  const ergebnis: { vereinId: string; angelegt?: number; verlegt?: number; ergebnisse?: number; fehler?: string }[] = [];
  let uebrig = 0;
  for (const a of aktive) {
    if (opt.nurLigaVereinIds && !opt.nurLigaVereinIds.includes(a.ligaVereinId)) continue;
    if (opt.frist !== undefined && Date.now() > opt.frist) {
      uebrig++;
      continue;
    }
    try {
      const angelegt = (await uebernehmeLigaSpiele(a.vereinId, CRON_AKTEUR, opt.jetzt)).angelegt;
      // Verlegungen und Ergebnisse aus den öffentlichen Daten (mit Benachrichtigung der Betroffenen)
      const geaendert = await uebernehmeAenderungen(a.vereinId, CRON_AKTEUR, opt.jetzt);
      ergebnis.push({ vereinId: a.vereinId, angelegt, verlegt: geaendert.verlegt, ergebnisse: geaendert.ergebnisse });
    } catch (err) {
      ergebnis.push({ vereinId: a.vereinId, fehler: err instanceof Error ? err.message : String(err) });
    }
    await adminDb.update(vereine).set({ ligaUebernahmeGeprueftAm: new Date() }).where(eq(vereine.id, a.vereinId));
  }
  return { ergebnis, uebrig };
}
