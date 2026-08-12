"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashePasswort, pruefePasswort } from "@/lib/passwort";

// "user" hat bewusst keine RLS (siehe Migration 0001) — hier unproblematisch,
// da ausschließlich die EIGENE Zeile über session.user.id geändert wird.
export async function passwortAendern(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const bisheriges = formData.get("bisherigesPasswort");
  const neues = formData.get("neuesPasswort");
  const wiederholung = formData.get("neuesPasswortWiederholung");

  if (typeof neues !== "string" || neues.length < 8) {
    throw new Error("Das neue Passwort muss mindestens 8 Zeichen haben.");
  }
  if (neues !== wiederholung) {
    throw new Error("Die Passwort-Wiederholung stimmt nicht überein.");
  }

  const nutzer = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!nutzer) redirect("/login");

  // Beim erzwungenen Ändern (Einmal-Passwort, mussPasswortAendern) wird das
  // bisherige Passwort NICHT nochmal abgefragt — die Person hat es gerade
  // erst per Login bewiesen. Beim freiwilligen Ändern (schon eingeloggt,
  // eigenes Passwort schon gesetzt) muss das aktuelle Passwort bestätigt
  // werden, damit nicht jeder mit einer offenen Session das Passwort ändern
  // kann (z.B. an einem fremden Rechner).
  if (nutzer.passwordHash && !nutzer.mussPasswortAendern) {
    if (typeof bisheriges !== "string" || !bisheriges) {
      throw new Error("Bitte das bisherige Passwort eingeben.");
    }
    const stimmt = await pruefePasswort(bisheriges, nutzer.passwordHash);
    if (!stimmt) throw new Error("Das bisherige Passwort ist falsch.");
  }

  const neuerHash = await hashePasswort(neues);
  await db
    .update(users)
    .set({ passwordHash: neuerHash, mussPasswortAendern: false })
    .where(eq(users.id, userId));

  // Die aktuelle JWT-Session trägt noch mussPasswortAendern=true (wird erst
  // bei einem neuen Login aktualisiert, siehe jwt-Callback in auth.ts) —
  // ohne Ausloggen würde requireSession() sofort wieder hierher
  // zurückschicken. Einmaliges erneutes Einloggen mit dem neuen Passwort
  // ist zumutbar und vermeidet fragile Session-Manipulation.
  await signOut({ redirectTo: "/login?passwortGeaendert=1" });
}
