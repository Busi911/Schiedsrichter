import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users, vereine } from "@/db/schema";
import { appUrl } from "./app-url";
import { abmeldeInfo } from "./abmelden";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { sendMail } from "./mailer";
import { formatMinuten, formatTrainingDatum } from "./training-ausfall";

export type AusfallMailDaten = {
  vereinName: string;
  mannschaft: string;
  halle: string; // Hallenname, ggf. mit Abteil
  datum: string; // YYYY-MM-DD
  startMinuten: number;
  endMinuten: number;
  grund: string | null;
  // "ausfall" = Training fällt aus (Halle frei); "findet_statt" = der Ausfall wurde zurückgenommen (Halle doch belegt).
  art?: "ausfall" | "findet_statt";
};

// Inhalt EINMAL beschrieben (siehe CLAUDE.md "E-Mail-Layout"); der Abmelde-Link kommt je Empfänger dazu.
export function trainingAusfallInhalt(d: AusfallMailDaten): EmailInhalt {
  const zeit = `${formatMinuten(d.startMinuten)}–${formatMinuten(d.endMinuten)} Uhr`;
  const datumLang = `${formatTrainingDatum(d.datum)}, ${zeit}`;
  if (d.art === "findet_statt") {
    return {
      vereinName: d.vereinName,
      ueberschrift: `Training findet doch statt: ${d.halle} ist am ${formatTrainingDatum(d.datum, false)} wieder belegt`,
      zeilen: [
        { text: datumLang, stark: true },
        `Der Ausfall des Trainings von ${d.mannschaft} (${d.halle}) wurde zurückgenommen. ${d.halle} ist in dieser Zeit nicht mehr frei.`,
      ],
      cta: { text: "Trainingsplan ansehen", url: `${appUrl()}/profil/training` },
      kleingedrucktes: "Du bekommst diese Mail als Trainer des Vereins. Abschaltbar in deinen Benachrichtigungs-Einstellungen.",
    };
  }
  return {
    vereinName: d.vereinName,
    ueberschrift: `Training fällt aus: ${d.halle} ist am ${formatTrainingDatum(d.datum, false)} frei`,
    zeilen: [
      { text: datumLang, stark: true },
      `Das Training von ${d.mannschaft} (${d.halle}) fällt aus. In dieser Zeit ist ${d.halle} frei.`,
      ...(d.grund ? [`Grund: ${d.grund}`] : []),
    ],
    cta: { text: "Trainingsplan ansehen", url: `${appUrl()}/profil/training` },
    kleingedrucktes: "Du bekommst diese Mail als Trainer des Vereins. Abschaltbar in deinen Benachrichtigungs-Einstellungen.",
  };
}

// Info an ALLE aktiven Trainer des Vereins (Entscheidung Betreiber 14.10.2026: erstmal alle Trainer, jede Person kann es im Profil abschalten;
// kein Vereins-Schalter), außer an die meldende Person selbst. Best-effort: ein Fehler bei einer Adresse stoppt die anderen nicht.
export async function sendeTrainingAusfallHinweise(vereinId: string, daten: Omit<AusfallMailDaten, "vereinName">, gemeldetVonUserId: string | null) {
  const [verein] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  if (!verein) return { versendet: 0 };

  const empfaenger = await adminDb
    .selectDistinct({ id: users.id, email: users.email })
    .from(funktionstraegerRollen)
    .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
    .where(
      and(
        eq(funktionstraegerRollen.typ, "trainer"),
        eq(funktionstraegerRollen.aktiv, true),
        eq(users.vereinId, vereinId),
        eq(users.trainingAusfallHinweiseAktiviert, true),
        ...(gemeldetVonUserId ? [ne(users.id, gemeldetVonUserId)] : [])
      )
    );

  const inhalt = trainingAusfallInhalt({ ...daten, vereinName: verein.name });
  const betreff =
    daten.art === "findet_statt"
      ? `Training findet doch statt: ${daten.halle} am ${formatTrainingDatum(daten.datum, false)}, ${formatMinuten(daten.startMinuten)} Uhr`
      : `Training fällt aus: ${daten.halle} frei am ${formatTrainingDatum(daten.datum, false)}, ${formatMinuten(daten.startMinuten)} Uhr`;
  let versendet = 0;
  await Promise.all(
    empfaenger.map(async (p) => {
      try {
        const mitAbmeldung = { ...inhalt, abmelden: abmeldeInfo(p.id, "training-ausfall") };
        await sendMail(p.email, betreff, emailAlsText(mitAbmeldung), emailAlsHtml(mitAbmeldung), { abmeldeUrl: mitAbmeldung.abmelden.url });
        versendet++;
      } catch (err) {
        console.error("Trainingsausfall-Mail fehlgeschlagen:", err);
      }
    })
  );
  return { versendet };
}
