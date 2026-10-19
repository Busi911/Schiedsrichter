"use server";

import { betaVorbei, normalisiereHerkunft } from "@/lib/abrechnung";
import { holeBetaStand } from "@/lib/system-einstellungen";
import { legeVereinMitAdminAn } from "@/lib/verein-anlegen";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { adminWillkommensInhalt } from "@/lib/willkommens-mail";
import {
  benachrichtigeSystemAdminsUeberRegistrierung,
  benachrichtigeSystemAdminsUeberUebernahmeAnfrage,
} from "@/lib/system-admin-benachrichtigung";
import { findeAehnlicheVereine } from "@/lib/verein-duplikat-daten";

// Eingaben des Formulars, die bei der Rückfrage "Ist das euer Verein?" unverändert zurückgegeben werden (React leert das Formular nach
// einer Server Action; die Rückfrage schickt die Werte als versteckte Felder wieder mit).
export type RegistrierenWerte = {
  vereinsname: string;
  adminName: string;
  adminEmail: string;
  strasse: string;
  plz: string;
  ort: string;
  rechnungEmail: string;
};

export type RegistrierenErgebnis =
  | { ergebnis: "registriert"; kostenpflichtig: boolean }
  // Es gibt einen Verein mit ähnlichem Namen: nichts wurde angelegt, die Person wird gefragt.
  // `vorhandene` = die Namen, wie die ähnlichen Vereine in der App heißen (ohne Zustand wie aktiv/inaktiv).
  | { ergebnis: "aehnlich"; werte: RegistrierenWerte; vorhandene: string[] }
  // "Das ist unser Verein": kein zweiter Verein, die Systemadmins melden sich.
  | { ergebnis: "anfrage_gesendet" }
  | { fehler: string };

// Öffentlich, login-frei erreichbar (siehe page.tsx) — daher der Beta-Stand
// ERST HIER, direkt vor dem Insert, statt nur auf einem beim Seitenaufruf
// vorberechneten Wert zu vertrauen. Ist ein Beta-Platz frei, wird der Verein
// Beta-Tester; sind alle Plätze vergeben (auch nach der automatischen
// Erhöhung bis BETA_PLAETZE_MAX, lib/beta-plaetze.ts), registriert er sich
// direkt kostenpflichtig (keine Warteliste mehr).
export async function vereinRegistrieren(
  formData: FormData
): Promise<RegistrierenErgebnis> {
  const vereinsname = formData.get("vereinsname");
  const adminName = formData.get("adminName");
  const adminEmail = formData.get("adminEmail");
  const strasse = formData.get("strasse");
  const plz = formData.get("plz");
  const ort = formData.get("ort");
  const rechnungEmailRoh = formData.get("rechnungEmail");
  const herkunft = normalisiereHerkunft(formData.get("herkunft"));
  // Nach dem Beta-Ende oder wenn alle Beta-Plätze vergeben sind, ist die Registrierung kostenpflichtig: dann ist die Rechnungs-E-Mail des Verantwortlichen Pflicht.
  const beta = await holeBetaStand();
  const kostenpflichtig = betaVorbei(new Date()) || beta.voll;
  const rechnungEmail = typeof rechnungEmailRoh === "string" ? rechnungEmailRoh.trim().toLowerCase() : "";
  if (kostenpflichtig && !rechnungEmail) return { fehler: "Bitte die E-Mail-Adresse des Verantwortlichen für die Rechnung angeben." };
  if (rechnungEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rechnungEmail)) return { fehler: "Die Rechnungs-E-Mail-Adresse ist ungültig." };

  if (
    typeof vereinsname !== "string" ||
    !vereinsname.trim() ||
    typeof adminName !== "string" ||
    !adminName.trim() ||
    typeof adminEmail !== "string" ||
    !adminEmail.trim() ||
    typeof strasse !== "string" ||
    !strasse.trim() ||
    typeof plz !== "string" ||
    !plz.trim() ||
    typeof ort !== "string" ||
    !ort.trim()
  ) {
    return { fehler: "Bitte alle Felder ausfüllen." };
  }

  // Gibt es den Verein schon (egal ob aktiv, in Vorbereitung oder inaktiv)? Dann wird er nicht still ein zweites Mal angelegt.
  // "derselbe" = die Person bestätigt, dass es ihr Verein ist; "anderer" = sie bestätigt, dass es ein anderer Verein ist.
  const entscheidung = formData.get("entscheidung");
  const aehnliche = await findeAehnlicheVereine(vereinsname);
  if (aehnliche.length > 0 && entscheidung !== "anderer") {
    if (entscheidung === "derselbe") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) return { fehler: "Die E-Mail-Adresse ist ungültig." };
      await benachrichtigeSystemAdminsUeberUebernahmeAnfrage(
        vereinsname.trim(),
        adminName.trim(),
        adminEmail.trim().toLowerCase(),
        aehnliche
      );
      return { ergebnis: "anfrage_gesendet" };
    }
    return {
      ergebnis: "aehnlich",
      vorhandene: [...new Set(aehnliche.map((v) => v.name))].slice(0, 3),
      werte: {
        vereinsname: vereinsname.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        strasse: strasse.trim(),
        plz: plz.trim(),
        ort: ort.trim(),
        rechnungEmail,
      },
    };
  }

  try {
    await legeVereinMitAdminAn(vereinsname, adminName, adminEmail, {
      strasse,
      plz,
      ort,
    }, rechnungEmail ? { email: rechnungEmail, ansprechpartner: adminName } : undefined, { betaVoll: beta.voll }, herkunft);
  } catch (err) {
    return {
      fehler:
        err instanceof Error ? err.message : "Registrierung fehlgeschlagen.",
    };
  }

  const email = adminEmail.trim().toLowerCase();
  try {
    const inhalt = adminWillkommensInhalt(vereinsname.trim(), email);
    await sendMail(
      email,
      "Willkommen bei HandballerPate",
      emailAlsText(inhalt),
      emailAlsHtml(inhalt)
    );
  } catch (err) {
    console.error("Willkommens-Mail nach Selbstregistrierung fehlgeschlagen:", err);
  }

  await benachrichtigeSystemAdminsUeberRegistrierung(
    vereinsname.trim(),
    adminName.trim(),
    email,
    aehnliche
  );

  return { ergebnis: "registriert", kostenpflichtig };
}
