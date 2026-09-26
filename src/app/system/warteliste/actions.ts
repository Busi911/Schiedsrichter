"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireSystemAdmin } from "@/lib/session";
import { adminDb } from "@/db/admin";
import { warteliste } from "@/db/schema";
import { legeVereinMitAdminAn } from "@/lib/verein-anlegen";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { willkommensInhalt } from "@/lib/willkommens-mail";

// Legt aus einem Warteliste-Eintrag denselben Verein+Admin-Datensatz an
// wie eine reguläre Registrierung (siehe legeVereinMitAdminAn) und
// entfernt den Eintrag danach — bewusst OHNE erneute Prüfung gegen das
// Beta-Limit: ein manuelles Freischalten durch den Systemadmin ist immer
// eine bewusste Entscheidung, unabhängig vom aktuellen Zählerstand.
export async function wartelisteFreischalten(formData: FormData) {
  await requireSystemAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Eintrag fehlt.");
  }

  const eintrag = await adminDb.query.warteliste.findFirst({
    where: eq(warteliste.id, id),
  });
  if (!eintrag) throw new Error("Eintrag nicht gefunden.");

  await legeVereinMitAdminAn(eintrag.vereinsname, eintrag.adminName, eintrag.adminEmail);
  await adminDb.delete(warteliste).where(eq(warteliste.id, id));

  try {
    const inhalt = willkommensInhalt(eintrag.vereinsname, eintrag.adminEmail, null);
    await sendMail(
      eintrag.adminEmail,
      "Willkommen bei HandballerPate",
      emailAlsText(inhalt),
      emailAlsHtml(inhalt)
    );
  } catch (err) {
    console.error("Willkommens-Mail nach Warteliste-Freischaltung fehlgeschlagen:", err);
  }

  revalidatePath("/system/warteliste");
  revalidatePath("/system/vereine");
  revalidatePath("/system");
}

export async function wartelisteEintragEntfernen(formData: FormData) {
  await requireSystemAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Eintrag fehlt.");
  }

  await adminDb.delete(warteliste).where(eq(warteliste.id, id));
  revalidatePath("/system/warteliste");
}
