import "server-only";
import { and, eq, gte, inArray, like } from "drizzle-orm";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaSpiele, ligaTeilnahmen, ligaVereine, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { dienstGiltFuerTermin } from "./eigene-dienste";
import { ladeDienstArten } from "./eigene-dienste-daten";
import { entscheideAuswaerts, type AuswaertsSpiel } from "./auswaerts-regeln";
import { kategorieText } from "./hallenplan-abgleich";
import { baueMannschaftsAufloeser } from "./nuliga/mannschaften-anlegen";
import { parseBerlinDatumZeit } from "./format";
import { zuordnungEntferntInhalt, zuordnungEntferntWegenVerlegungInhalt } from "./zuordnung";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { sendMail } from "./mailer";

// Auswärtsspiele als Termine (typ "auswaertsspiel") — NUR für eigene Dienste, die für Auswärtsspiele gelten (z.B. Fahrer).
// Feste Dienste (Schiedsrichter, Zeitnehmer, Ordner ...), der Hallenplan-Abgleich und die Liga-Änderungen (liga-aenderungen.ts)
// betrachten nur "rundenspiel" und fassen diese Termine deshalb nie an.
//
// - Angelegt wird ein künftiges Auswärtsspiel einer eigenen Mannschaft nur, wenn mindestens ein aktiver eigener Dienst dafür gilt
//   (icsUid "liga:<spielId>" wie bei der Liga-Übernahme, nie doppelt).
// - Verlegung: neue Zeit/Halle, die Einteilungen der eigenen Dienste entfallen und die Personen mit Login werden informiert
//   (Entscheidung des Betreibers: Fahrer bleiben bei einer Verlegung NICHT eingetragen).
// - Absage (oder Spiel nicht mehr in den Liga-Daten): Personen werden informiert, der Termin entfällt.
// - Nur andere Halle: Ort wird still angepasst, Einteilungen bleiben. Ergebnis wird still übernommen.
// - Gilt kein Dienst mehr (Dienst gelöscht/deaktiviert, Auswärtsspiele abgewählt), werden künftige Auswärts-Termine OHNE Einteilung
//   entfernt; mit Einteilung bleiben sie, bis der Dienstwart sie austrägt.
// Vergangene Termine werden nie verlegt, abgesagt oder gelöscht.

const UID_PRAEFIX = "liga:";

const heuteBerlin = (jetzt: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt); // YYYY-MM-DD

export type AuswaertsErgebnis = { angelegt: number; verlegt: number; abgesagt: number; ortGeaendert: number; entfernt: number; ergebnisse: number };

type Betroffen = { userId: string; dienstArtId: string | null };

function spielStart(s: { beginn: Date | null; datum: string; uhrzeit: string | null }): Date | null {
  const start = s.beginn ?? (s.uhrzeit ? parseBerlinDatumZeit(`${s.datum}T${s.uhrzeit}`) : null);
  return start && !Number.isNaN(start.getTime()) ? start : null;
}

export async function pflegeAuswaertsTermine(vereinId: string, jetzt = new Date()): Promise<AuswaertsErgebnis> {
  const ergebnis: AuswaertsErgebnis = { angelegt: 0, verlegt: 0, abgesagt: 0, ortGeaendert: 0, entfernt: 0, ergebnisse: 0 };
  const verein = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { id: true, name: true } });
  if (!verein) return ergebnis;
  const arten = (await withTenant(vereinId, (tx) => ladeDienstArten(tx, vereinId, true))).filter((a) => a.bedarfAuswaerts > 0);
  const giltEinDienst = (mannschaftId: string | null) =>
    arten.some((a) => dienstGiltFuerTermin(a, { id: "", typ: "auswaertsspiel", mannschaftId }));

  // Eigene Teams (Teamtable-ID je Gruppe) aus den aktiven Teilnahmen der Liga-Mannschaften des Vereins.
  const lv = await adminDb.query.ligaVereine.findFirst({ where: eq(ligaVereine.vereinId, vereinId), columns: { id: true } });
  const eigeneTeams = new Map<string, { geschlecht: string | null; altersklasse: string | null }>();
  if (lv) {
    const teilnahmen = await adminDb
      .select({
        gruppeId: ligaTeilnahmen.gruppeId,
        teamtable: ligaTeilnahmen.nuligaTeamtableId,
        geschlecht: ligaMannschaften.geschlecht,
        altersklasse: ligaMannschaften.altersklasse,
      })
      .from(ligaTeilnahmen)
      .innerJoin(ligaMannschaften, eq(ligaMannschaften.id, ligaTeilnahmen.mannschaftId))
      .where(and(eq(ligaMannschaften.ligaVereinId, lv.id), eq(ligaTeilnahmen.aktiv, true)));
    for (const t of teilnahmen) if (t.teamtable) eigeneTeams.set(`${t.gruppeId}:${t.teamtable}`, t);
  }

  // 1) Bestehende Auswärts-Termine (verknüpft über ligaSpielId) mit den Liga-Daten abgleichen.
  const vorhandene = await adminDb
    .select({
      id: termine.id,
      start: termine.start,
      ort: termine.ort,
      beschreibung: termine.beschreibung,
      mannschaftId: termine.mannschaftId,
      ergebnisHeim: termine.ergebnisHeim,
      ergebnisAuswaerts: termine.ergebnisAuswaerts,
      icsUid: termine.icsUid,
      ligaSpielId: termine.ligaSpielId,
    })
    .from(termine)
    .where(and(eq(termine.vereinId, vereinId), eq(termine.typ, "auswaertsspiel"), like(termine.icsUid, `${UID_PRAEFIX}%`)));
  const spielIds = vorhandene.map((t) => t.ligaSpielId).filter((id): id is string => !!id);
  const spiele = spielIds.length
    ? await adminDb
        .select({
          id: ligaSpiele.id,
          status: ligaSpiele.status,
          beginn: ligaSpiele.beginn,
          datum: ligaSpiele.datum,
          uhrzeit: ligaSpiele.uhrzeit,
          halleName: ligaSpiele.halleName,
          toreHeim: ligaSpiele.toreHeim,
          toreGast: ligaSpiele.toreGast,
          ergebnisBestaetigt: ligaSpiele.ergebnisBestaetigt,
        })
        .from(ligaSpiele)
        .where(inArray(ligaSpiele.id, spielIds))
    : [];
  const spielNachId = new Map(spiele.map((s) => [s.id, s]));
  const zuordnungen = vorhandene.length
    ? await adminDb
        .select({ terminId: terminZuordnungen.terminId, userId: terminZuordnungen.userId, dienstArtId: terminZuordnungen.dienstArtId })
        .from(terminZuordnungen)
        .where(
          inArray(
            terminZuordnungen.terminId,
            vorhandene.map((t) => t.id)
          )
        )
    : [];
  const zuordnungenJe = new Map<string, typeof zuordnungen>();
  for (const z of zuordnungen) zuordnungenJe.set(z.terminId, [...(zuordnungenJe.get(z.terminId) ?? []), z]);

  const mails: { betroffen: Betroffen[]; art: "verlegt" | "abgesagt"; termin: { start: Date; ort: string | null; beschreibung: string | null } }[] = [];
  for (const t of vorhandene) {
    const s = t.ligaSpielId ? spielNachId.get(t.ligaSpielId) : undefined;
    // Ein nicht genehmigtes Ergebnis ist evtl. nur ein Zwischenstand (siehe istZwischenstand): nur bestätigte Ergebnisse übernehmen.
    const spiel: AuswaertsSpiel | null = s
      ? {
          status: s.status,
          start: spielStart(s),
          halleName: s.halleName,
          toreHeim: s.ergebnisBestaetigt ? s.toreHeim : null,
          toreGast: s.ergebnisBestaetigt ? s.toreGast : null,
        }
      : null;
    const e = entscheideAuswaerts(t, spiel, jetzt);
    const eingeteilt = zuordnungenJe.get(t.id) ?? [];
    const mitLogin = eingeteilt.filter((z): z is Betroffen & { terminId: string; userId: string } => !!z.userId);

    if (e.aktion === "absagen") {
      await withTenant(vereinId, (tx) => tx.delete(termine).where(and(eq(termine.id, t.id), eq(termine.vereinId, vereinId))));
      if (mitLogin.length) mails.push({ betroffen: mitLogin, art: "abgesagt", termin: t });
      ergebnis.abgesagt++;
      continue;
    }
    if (e.aktion === "verlegen" && e.start) {
      const neu = { start: e.start, ort: e.ort ?? t.ort, beschreibung: t.beschreibung };
      await withTenant(vereinId, async (tx) => {
        await tx.update(termine).set({ start: neu.start, ort: neu.ort }).where(and(eq(termine.id, t.id), eq(termine.vereinId, vereinId)));
        await tx.delete(terminZuordnungen).where(eq(terminZuordnungen.terminId, t.id));
      });
      if (mitLogin.length) mails.push({ betroffen: mitLogin, art: "verlegt", termin: neu });
      ergebnis.verlegt++;
    } else if (e.aktion === "ort") {
      await withTenant(vereinId, (tx) =>
        tx.update(termine).set({ ort: e.ort ?? null }).where(and(eq(termine.id, t.id), eq(termine.vereinId, vereinId)))
      );
      ergebnis.ortGeaendert++;
    }
    if (e.ergebnis) {
      await withTenant(vereinId, (tx) =>
        tx
          .update(termine)
          .set({ ergebnisHeim: e.ergebnis!.heim, ergebnisAuswaerts: e.ergebnis!.gast })
          .where(and(eq(termine.id, t.id), eq(termine.vereinId, vereinId)))
      );
      ergebnis.ergebnisse++;
    }
    // Kein Dienst gilt mehr: künftige, leere Termine entfernen (verlegte haben jetzt ebenfalls keine Einteilung mehr).
    const leer = e.aktion === "verlegen" || eingeteilt.length === 0;
    const start = e.aktion === "verlegen" && e.start ? e.start : t.start;
    if (leer && start.getTime() > jetzt.getTime() && !giltEinDienst(t.mannschaftId)) {
      await withTenant(vereinId, (tx) => tx.delete(termine).where(and(eq(termine.id, t.id), eq(termine.vereinId, vereinId))));
      ergebnis.entfernt++;
    }
  }

  // 2) Fehlende künftige Auswärtsspiele anlegen (nur wenn überhaupt ein Dienst für Auswärtsspiele aktiv ist).
  if (arten.length > 0 && eigeneTeams.size > 0) {
    const vorhandeneUids = new Set(
      (
        await adminDb
          .select({ uid: termine.icsUid })
          .from(termine)
          .where(and(eq(termine.vereinId, vereinId), like(termine.icsUid, `${UID_PRAEFIX}%`)))
      ).map((t) => t.uid)
    );
    const gruppen = [...new Set([...eigeneTeams.keys()].map((k) => k.split(":")[0]))];
    const kandidaten = await adminDb
      .select()
      .from(ligaSpiele)
      .where(and(inArray(ligaSpiele.gruppeId, gruppen), gte(ligaSpiele.datum, heuteBerlin(jetzt)), eq(ligaSpiele.istFreundschaft, false)));
    const aufloeser = await baueMannschaftsAufloeser(adminDb, vereinId);
    for (const s of kandidaten) {
      if (s.status === "abgesagt") continue;
      const gast = s.gastTeamtableId ? eigeneTeams.get(`${s.gruppeId}:${s.gastTeamtableId}`) : undefined;
      // Nur echte Auswärtsspiele: eigenes Team als Gast, Gegner nicht der eigene Verein (Vereinsderby = Heimspiel).
      if (!gast || (s.heimTeamtableId && eigeneTeams.has(`${s.gruppeId}:${s.heimTeamtableId}`))) continue;
      if (vorhandeneUids.has(`${UID_PRAEFIX}${s.id}`)) continue;
      const start = spielStart(s);
      if (!start || start.getTime() <= jetzt.getTime()) continue;
      const mannschaftId = aufloeser(s);
      if (!giltEinDienst(mannschaftId)) continue;
      await withTenant(vereinId, (tx) =>
        tx.insert(termine).values({
          vereinId,
          typ: "auswaertsspiel",
          quelle: "rundenspiel_import",
          start,
          ort: s.halleName,
          beschreibung: `${s.heimName} – ${s.gastName}`,
          mannschaftId,
          icsUid: `${UID_PRAEFIX}${s.id}`,
          heimMannschaftName: s.heimName,
          auswaertsMannschaftName: s.gastName,
          kategorie: kategorieText(gast.geschlecht, gast.altersklasse),
          pflichtspiel: true,
          ligaSpielId: s.id,
        })
      );
      vorhandeneUids.add(`${UID_PRAEFIX}${s.id}`);
      ergebnis.angelegt++;
    }
  }

  // 3) Betroffene informieren (nach den Änderungen, Fehler beim Versand brechen nichts ab).
  if (mails.length) {
    const namen = new Map((await withTenant(vereinId, (tx) => ladeDienstArten(tx, vereinId, false))).map((a) => [a.id, a.name]));
    for (const m of mails) {
      for (const b of m.betroffen) {
        // "user" hat keine RLS: ausdrücklich auf den Verein filtern.
        const person = await adminDb.query.users.findFirst({ where: and(eq(users.id, b.userId), eq(users.vereinId, vereinId)) });
        if (!person) continue;
        const dienst = (b.dienstArtId && namen.get(b.dienstArtId)) || "Helfer";
        const inhalt: EmailInhalt =
          m.art === "verlegt"
            ? { vereinName: verein.name, ...zuordnungEntferntWegenVerlegungInhalt(dienst, m.termin) }
            : {
                vereinName: verein.name,
                ...zuordnungEntferntInhalt(dienst, m.termin),
                ueberschrift: `Das Auswärtsspiel wurde abgesagt — deine Einteilung als ${dienst} entfällt.`,
              };
        const betreff = m.art === "verlegt" ? "Auswärtsspiel verlegt — deine Einteilung wurde entfernt" : "Auswärtsspiel abgesagt";
        try {
          await sendMail(person.email, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
        } catch (err) {
          console.error("Mail zum Auswärtsspiel konnte nicht gesendet werden:", err);
        }
      }
    }
  }
  return ergebnis;
}
