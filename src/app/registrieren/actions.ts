"use server";

import { betaVorbei } from "@/lib/abrechnung";
import { holeBetaStand } from "@/lib/system-einstellungen";
import { legeVereinMitAdminAn } from "@/lib/verein-anlegen";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { willkommensInhalt } from "@/lib/willkommens-mail";
import { benachrichtigeSystemAdminsUeberRegistrierung } from "@/lib/system-admin-benachrichtigung";

// Öffentlich, login-frei erreichbar (siehe page.tsx) — daher der Beta-Stand
// ERST HIER, direkt vor dem Insert, statt nur auf einem beim Seitenaufruf
// vorberechneten Wert zu vertrauen. Ist ein Beta-Platz frei, wird der Verein
// Beta-Tester; sind alle Plätze vergeben (auch nach der automatischen
// Erhöhung bis BETA_PLAETZE_MAX, lib/beta-plaetze.ts), registriert er sich
// direkt kostenpflichtig (keine Warteliste mehr).
export async function vereinRegistrieren(
  formData: FormData
): Promise<{ ergebnis: "registriert"; kostenpflichtig: boolean } | { fehler: string }> {
  const vereinsname = formData.get("vereinsname");
  const adminName = formData.get("adminName");
  const adminEmail = formData.get("adminEmail");
  const strasse = formData.get("strasse");
  const plz = formData.get("plz");
  const ort = formData.get("ort");
  const rechnungEmailRoh = formData.get("rechnungEmail");
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

  try {
    await legeVereinMitAdminAn(vereinsname, adminName, adminEmail, {
      strasse,
      plz,
      ort,
    }, rechnungEmail ? { email: rechnungEmail, ansprechpartner: adminName } : undefined, { betaVoll: beta.voll });
  } catch (err) {
    return {
      fehler:
        err instanceof Error ? err.message : "Registrierung fehlgeschlagen.",
    };
  }

  const email = adminEmail.trim().toLowerCase();
  try {
    const inhalt = willkommensInhalt(vereinsname.trim(), email, null);
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
    email
  );

  return { ergebnis: "registriert", kostenpflichtig };
}
