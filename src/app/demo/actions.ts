"use server";

import { revalidatePath } from "next/cache";
import { auth, signIn } from "@/auth";
import { darfDemoZuruecksetzen, DEMO_VEREIN_ID } from "@/lib/demo-konstanten";
import { holeDemoVerein, setzeDemoVereinZurueck } from "@/lib/demo-verein";

// Startet die Demo: Anmeldung ohne Passwort als Demo-Admin (Provider "demo", siehe auth.ts). Gibt es den Demo-Verein noch nicht (z.B. frisch
// ausgeliefert, noch kein Nacht-Lauf), wird er vorher angelegt.
export async function demoStarten() {
  if (!(await holeDemoVerein())) await setzeDemoVereinZurueck();
  await signIn("demo", { redirectTo: "/admin" });
}

// "Jetzt zurücksetzen" im Demo-Banner: nur für Personen IM Demo-Verein, und höchstens alle paar Minuten (sonst ließe sich die Datenbank mit Dauerklicks
// belasten).
export async function demoJetztZuruecksetzen() {
  const session = await auth();
  if (session?.user?.vereinId !== DEMO_VEREIN_ID) throw new Error("Nur in der Demo möglich.");
  const verein = await holeDemoVerein();
  if (verein && !darfDemoZuruecksetzen(verein.erstelltAm)) {
    throw new Error("Die Demo wurde gerade erst zurückgesetzt. Bitte in ein paar Minuten noch einmal versuchen.");
  }
  await setzeDemoVereinZurueck();
  revalidatePath("/admin", "layout");
  revalidatePath("/profil", "layout");
}
