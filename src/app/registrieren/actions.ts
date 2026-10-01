"use server";

import { adminDb } from "@/db/admin";
import { warteliste as wartelisteTabelle } from "@/db/schema";
import { holeSystemEinstellungen, zaehleVereineFuerBetaLimit } from "@/lib/system-einstellungen";
import { legeVereinMitAdminAn } from "@/lib/verein-anlegen";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { willkommensInhalt } from "@/lib/willkommens-mail";
import { benachrichtigeSystemAdminsUeberRegistrierung } from "@/lib/system-admin-benachrichtigung";

// Öffentlich, login-frei erreichbar (siehe page.tsx) — daher der Zähler-
// Vergleich ERST HIER, direkt vor dem Insert, statt nur auf einem beim
// Seitenaufruf vorberechneten Wert zu vertrauen: zwei nahezu gleichzeitige
// Registrierungen dürfen das Beta-Limit nicht gemeinsam überschreiten,
// nur weil beide beim Rendern noch einen freien Platz sahen.
export async function vereinRegistrieren(
  formData: FormData
): Promise<{ ergebnis: "registriert" | "warteliste" } | { fehler: string }> {
  const vereinsname = formData.get("vereinsname");
  const adminName = formData.get("adminName");
  const adminEmail = formData.get("adminEmail");
  const strasse = formData.get("strasse");
  const plz = formData.get("plz");
  const ort = formData.get("ort");

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

  const { betaVereinLimit } = await holeSystemEinstellungen();
  const vereineCount = await zaehleVereineFuerBetaLimit();

  if (vereineCount >= betaVereinLimit) {
    await adminDb.insert(wartelisteTabelle).values({
      vereinsname: vereinsname.trim(),
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim().toLowerCase(),
    });
    return { ergebnis: "warteliste" };
  }

  try {
    await legeVereinMitAdminAn(vereinsname, adminName, adminEmail, {
      strasse,
      plz,
      ort,
    });
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

  return { ergebnis: "registriert" };
}
