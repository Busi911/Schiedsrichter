import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, termine, terminZuordnungen, users } from "@/db/schema";
import type { EntfernteZuordnungBeiVerlegung, RundenspielAenderung } from "./rundenspiel-sync";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt, type EmailZeile } from "./email-layout";
import { formatDatumZeit } from "./format";
import { formatErgebnis } from "./termin-label";
import { appUrl } from "./app-url";
import { terminVerlegtInhalt, zuordnungEntferntWegenVerlegungInhalt } from "./zuordnung";

// Pro Spiel ein kompakter Block statt eines langen Satzes: Spielname fett, darunter Klasse/Termin/Halle und WAS sich
// geändert hat (alter → neuer Termin bei einer Verlegung, das eingetragene Ergebnis bei einem neuen Ergebnis, siehe
// startAlt/ortAlt/ergebnisHeim/ergebnisAuswaerts in RundenspielAenderung, rundenspiel-sync.ts).
export function rundenspielAenderungZeilen(a: RundenspielAenderung): EmailZeile[] {
  const zeilen: EmailZeile[] = [
    { text: `${a.heimMannschaft} – ${a.auswaertsMannschaft}`, stark: true, neueGruppe: true },
    [a.kategorie, formatDatumZeit(a.start), a.ort].filter(Boolean).join(" · "),
  ];
  if (a.verlegt) {
    const alt = [formatDatumZeit(a.startAlt), a.ortAlt].filter(Boolean).join(" · ");
    zeilen.push(`Verlegt, vorher: ${alt}`);
  }
  if (a.ergebnisNeu) {
    const ergebnis = formatErgebnis(a.ergebnisHeim, a.ergebnisAuswaerts);
    zeilen.push(ergebnis ? `Ergebnis: ${ergebnis}` : "Ergebnis eingetragen");
  }
  return zeilen;
}

// Mehr als so viele Spiele machen die Mail unlesbar: der Rest steht im Hallenspielplan (Button).
const MAX_SPIELE_IN_MAIL = 10;

export function rundenspielAenderungenInhalt(
  vereinName: string,
  aenderungen: RundenspielAenderung[]
): EmailInhalt {
  const sichtbar = aenderungen.slice(0, MAX_SPIELE_IN_MAIL);
  const rest = aenderungen.length - sichtbar.length;
  return {
    vereinName,
    ueberschrift: `${aenderungen.length} Änderung${aenderungen.length === 1 ? "" : "en"} im Hallenspielplan`,
    zeilen: [
      ...sichtbar.flatMap(rundenspielAenderungZeilen),
      ...(rest > 0 ? [{ text: `… und ${rest} weitere im Hallenspielplan.`, neueGruppe: true }] : []),
    ],
    cta: {
      text: "Zum Hallenspielplan",
      url: `${appUrl()}/admin/termine?tab=rundenspiele`,
    },
  };
}

// Wird nach jedem automatischen nuLiga-Sync aufgerufen (siehe
// synchronisiereAlleAktivenNuligaVereine in rundenspiel-sync.ts) — nur wenn
// der Vereinsadmin das per Opt-in aktiviert hat (siehe
// vereine.rundenspielAenderungenBenachrichtigungAktiviert, einstellbar auf
// /admin/einstellungen), da nicht jeder Verein diesen zusätzlichen Kanal
// will.
export async function sendeRundenspielAenderungenBenachrichtigung(
  verein: { id: string; name: string; rundenspielAenderungenBenachrichtigungAktiviert: boolean },
  aenderungen: RundenspielAenderung[]
): Promise<{ versendet: number }> {
  if (!verein.rundenspielAenderungenBenachrichtigungAktiviert || aenderungen.length === 0) {
    return { versendet: 0 };
  }

  const admins = await adminDb
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.vereinId, verein.id), eq(users.istAdmin, true)));
  if (admins.length === 0) return { versendet: 0 };

  const inhalt = rundenspielAenderungenInhalt(verein.name, aenderungen);
  const betreff = `${aenderungen.length} Änderung${aenderungen.length === 1 ? "" : "en"} im Hallenspielplan bei ${verein.name}`;

  let versendet = 0;
  for (const admin of admins) {
    await sendMail(admin.email, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
    versendet++;
  }
  return { versendet };
}

// Wird nach jedem automatischen Sync aufgerufen (nuLiga: siehe
// synchronisiereAlleAktivenNuligaVereine in rundenspiel-sync.ts; handball.net:
// siehe synchronisiereAlleAktivenHandballNetMannschaften in
// handball-net-sync.ts) — bewusst OHNE Opt-in (anders als
// sendeRundenspielAenderungenBenachrichtigung oben): das hier informiert die
// direkt BETROFFENE Person über den Wegfall ihrer eigenen Zuordnung, kein
// zusätzlicher Admin-Kanal, den man sich aussuchen könnte.
export async function sendeZuordnungEntferntWegenVerlegungBenachrichtigungen(
  verein: { id: string; name: string },
  entfernte: EntfernteZuordnungBeiVerlegung[]
): Promise<{ versendet: number }> {
  if (entfernte.length === 0) return { versendet: 0 };

  let versendet = 0;
  for (const e of entfernte) {
    const [person, termin] = await Promise.all([
      adminDb.query.users.findFirst({ where: eq(users.id, e.userId) }),
      adminDb.query.termine.findFirst({ where: eq(termine.id, e.terminId) }),
    ]);
    if (!person || !termin) continue;

    const inhalt: EmailInhalt = {
      vereinName: verein.name,
      ...zuordnungEntferntWegenVerlegungInhalt(e.funktionstraegerTyp, termin),
    };
    try {
      await sendMail(
        person.email,
        "Termin verlegt — deine Zuordnung wurde entfernt",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
      versendet++;
    } catch (err) {
      console.error("Verlegungs-Entfernungs-Mail konnte nicht gesendet werden:", err);
    }
  }
  return { versendet };
}

// Bei einer Verlegung eines Ligaspiels (Sync) bleiben Schiedsrichter eingetragen (der Verband setzt sie an) und Trainer sind nie
// zugeordnet — beide erfahren sonst nichts. Deshalb eine Info-Mail (bewusst OHNE Opt-in und nicht abbestellbar, wie jede Verlegung):
// an die für den Termin eingetragenen Schiedsrichter mit Login und an die aktiven Trainer der Mannschaft. Wer schon die Mail
// "Zuordnung entfernt" bekommen hat (entfernte), bekommt diese nicht zusätzlich. Spieler haben kein Konto und sind nicht erreichbar.
export async function sendeVerlegungAnSchiedsrichterUndTrainerBenachrichtigungen(
  verein: { id: string; name: string },
  aenderungen: RundenspielAenderung[],
  entfernte: EntfernteZuordnungBeiVerlegung[] = []
): Promise<{ versendet: number }> {
  let versendet = 0;
  for (const a of aenderungen) {
    if (!a.verlegt || a.start.getTime() <= Date.now()) continue;
    const termin = await adminDb.query.termine.findFirst({ where: and(eq(termine.id, a.terminId), eq(termine.vereinId, verein.id)) });
    if (!termin) continue;

    const bereitsInformiert = new Set(entfernte.filter((e) => e.terminId === a.terminId).map((e) => e.userId));
    const schiris = await adminDb
      .select({ userId: terminZuordnungen.userId })
      .from(terminZuordnungen)
      .where(
        and(eq(terminZuordnungen.terminId, a.terminId), eq(terminZuordnungen.funktionstraegerTyp, "schiedsrichter"), isNotNull(terminZuordnungen.userId))
      );
    const trainer = termin.mannschaftId
      ? await adminDb
          .select({ userId: funktionstraegerRollen.userId })
          .from(funktionstraegerRollen)
          .where(
            and(
              eq(funktionstraegerRollen.vereinId, verein.id),
              eq(funktionstraegerRollen.typ, "trainer"),
              eq(funktionstraegerRollen.mannschaftId, termin.mannschaftId),
              eq(funktionstraegerRollen.aktiv, true)
            )
          )
      : [];

    const alt = { start: a.startAlt, ort: a.ortAlt };
    const neu = { start: a.start, ort: a.ort, beschreibung: null };
    const spiel = `${a.heimMannschaft} – ${a.auswaertsMannschaft}`;
    const empfaenger = new Map<string, EmailInhalt>();
    for (const t of trainer) {
      if (!t.userId || bereitsInformiert.has(t.userId)) continue;
      const basis = terminVerlegtInhalt([], alt, neu);
      empfaenger.set(t.userId, {
        vereinName: verein.name,
        ueberschrift: "Ein Spiel deiner Mannschaft wurde verlegt.",
        zeilen: [{ text: spiel, stark: true }, ...basis.zeilen],
      });
    }
    // Schiedsrichter zuletzt: ist jemand beides, gilt die Mail mit der Frage "kannst du zum neuen Termin?".
    for (const sr of schiris) {
      if (!sr.userId || bereitsInformiert.has(sr.userId)) continue;
      const basis = terminVerlegtInhalt(["schiedsrichter"], alt, neu);
      empfaenger.set(sr.userId, { vereinName: verein.name, ...basis, zeilen: [{ text: spiel, stark: true }, ...basis.zeilen] });
    }

    for (const [userId, inhalt] of empfaenger) {
      const person = await adminDb.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.vereinId, verein.id)) });
      if (!person) continue;
      try {
        await sendMail(person.email, `Spiel verlegt: ${spiel}`, emailAlsText(inhalt), emailAlsHtml(inhalt));
        versendet++;
      } catch (err) {
        console.error("Verlegungs-Info-Mail konnte nicht gesendet werden:", err);
      }
    }
  }
  return { versendet };
}
