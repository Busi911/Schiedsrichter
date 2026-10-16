import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users, vereine } from "@/db/schema";
import { appUrl } from "./app-url";
import { abmeldeInfo } from "./abmelden";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { sendMail } from "./mailer";
import { formatMinuten, formatTrainingDatum } from "./training-ausfall";

export type BelegungMailDaten = {
  vereinName: string;
  halle: string; // Ort, ggf. mit Abteil
  datum: string; // YYYY-MM-DD
  startMinuten: number;
  endMinuten: number;
  ausfallMannschaft: string; // die Mannschaft, deren Training ausfällt
  belegtVon: string; // die Mannschaft, die die Zeit bucht
  notiz: string | null;
  // "belegt": eine Mannschaft hat die freie Zeit gebucht; "wieder_frei": die Buchung wurde aufgehoben; "entfaellt": der Ausfall wurde vom Admin zurückgenommen, die Belegung entfällt
  variante: "belegt" | "wieder_frei" | "entfaellt";
};

const KLEIN = "Du bekommst diese Mail als Trainer bzw. Admin des Vereins. Abschaltbar in deinen Benachrichtigungs-Einstellungen.";

// Inhalt EINMAL beschrieben (siehe CLAUDE.md "E-Mail-Layout"); der Abmelde-Link kommt je Empfänger dazu.
export function trainingBelegungInhalt(d: BelegungMailDaten): EmailInhalt {
  const wann = `${formatTrainingDatum(d.datum)}, ${formatMinuten(d.startMinuten)}–${formatMinuten(d.endMinuten)} Uhr`;
  const kurz = formatTrainingDatum(d.datum, false);
  const cta = { text: "Trainingsplan ansehen", url: `${appUrl()}/profil/training` };
  if (d.variante === "belegt") {
    return {
      vereinName: d.vereinName,
      ueberschrift: `Frei gewordene Zeit belegt: ${d.belegtVon} nutzt ${d.halle} am ${kurz}`,
      zeilen: [
        { text: wann, stark: true },
        `${d.belegtVon} hat die Zeit übernommen, in der das Training von ${d.ausfallMannschaft} ausfällt (${d.halle}).`,
        ...(d.notiz ? [`Notiz: ${d.notiz}`] : []),
      ],
      cta,
      kleingedrucktes: KLEIN,
    };
  }
  if (d.variante === "wieder_frei") {
    return {
      vereinName: d.vereinName,
      ueberschrift: `Wieder frei: ${d.halle} ist am ${kurz} frei`,
      zeilen: [{ text: wann, stark: true }, `${d.belegtVon} hat die Belegung aufgehoben. Das Training von ${d.ausfallMannschaft} fällt weiter aus, ${d.halle} ist in dieser Zeit wieder zu haben.`],
      cta: { text: "Zeit belegen", url: cta.url },
      kleingedrucktes: KLEIN,
    };
  }
  return {
    vereinName: d.vereinName,
    ueberschrift: `Belegung entfällt: ${d.ausfallMannschaft} trainiert am ${kurz} doch`,
    zeilen: [{ text: wann, stark: true }, `Der Ausfall wurde zurückgenommen, deshalb entfällt eure Belegung von ${d.halle}.`],
    cta,
    kleingedrucktes: KLEIN,
  };
}

export type BelegungEmpfaenger =
  | { art: "alleTrainer" }
  // Trainer bestimmter Mannschaften, optional dazu alle Vereinsadmins
  | { art: "mannschaften"; mannschaftIds: string[]; mitAdmins: boolean };

// Best-effort Versand an aktive Trainer (und ggf. Admins), die den Schalter nicht abgeschaltet haben, außer an die handelnde Person. Ein Fehler stoppt die anderen nicht.
export async function sendeTrainingBelegungHinweise(vereinId: string, daten: Omit<BelegungMailDaten, "vereinName">, empfaenger: BelegungEmpfaenger, vonUserId: string | null) {
  const [verein] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  if (!verein) return { versendet: 0 };
  const nichtIch = vonUserId ? [ne(users.id, vonUserId)] : [];
  const grund = [eq(users.vereinId, vereinId), eq(users.trainingAusfallHinweiseAktiviert, true), ...nichtIch];

  const trainerBedingung =
    empfaenger.art === "alleTrainer"
      ? [eq(funktionstraegerRollen.typ, "trainer"), eq(funktionstraegerRollen.aktiv, true)]
      : [eq(funktionstraegerRollen.typ, "trainer"), eq(funktionstraegerRollen.aktiv, true), inArray(funktionstraegerRollen.mannschaftId, empfaenger.mannschaftIds.length ? empfaenger.mannschaftIds : ["00000000-0000-0000-0000-000000000000"])];
  const trainer = await adminDb
    .selectDistinct({ id: users.id, email: users.email })
    .from(funktionstraegerRollen)
    .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
    .where(and(...trainerBedingung, ...grund));
  const admins = empfaenger.art === "mannschaften" && empfaenger.mitAdmins ? await adminDb.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.istAdmin, true), ...grund)) : [];
  const alle = [...new Map([...trainer, ...admins].map((p) => [p.id, p])).values()];

  const inhalt = trainingBelegungInhalt({ ...daten, vereinName: verein.name });
  let versendet = 0;
  await Promise.all(
    alle.map(async (p) => {
      try {
        const mitAbmeldung = { ...inhalt, abmelden: abmeldeInfo(p.id, "training-ausfall") };
        await sendMail(p.email, inhalt.ueberschrift, emailAlsText(mitAbmeldung), emailAlsHtml(mitAbmeldung), { abmeldeUrl: mitAbmeldung.abmelden.url });
        versendet++;
      } catch (err) {
        console.error("Trainingsbelegung-Mail fehlgeschlagen:", err);
      }
    })
  );
  return { versendet };
}
