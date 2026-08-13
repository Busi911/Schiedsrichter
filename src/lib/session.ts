import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Erzwingt die Passwort-Änderung nach einem Einmal-Passwort (siehe
// mussPasswortAendern in db/schema.ts), bevor irgendeine andere Seite
// zugänglich ist. /profil/passwort-aendern selbst prüft die Session direkt
// über auth() statt über requireSession()/requireSystemAdmin(), sonst gäbe
// es hier eine Redirect-Schleife.
function erzwingePasswortAenderungFallsNoetig(mussPasswortAendern: boolean) {
  if (mussPasswortAendern) {
    redirect("/profil/passwort-aendern");
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.vereinId) {
    redirect("/login");
  }
  erzwingePasswortAenderungFallsNoetig(session.user.mussPasswortAendern);
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!session.user.istAdmin) {
    redirect("/profil");
  }
  return session;
}

// Systemadmins gehören keinem Verein an (vereinId ist null) — deshalb
// eigenständig und NICHT über requireSession(), das vereinId voraussetzt.
export async function requireSystemAdmin() {
  const session = await auth();
  if (!session?.user?.istSystemAdmin) {
    redirect("/login");
  }
  erzwingePasswortAenderungFallsNoetig(session.user.mussPasswortAendern);
  return session;
}
