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

// Lässt sowohl volle Admins als auch "nur lesend"-Admins durch (siehe
// istAdminLesend in db/schema.ts) — beide sehen dieselben /admin-Seiten.
// Für schreibende Server-Actions reicht das NICHT, siehe
// requireAdminSchreibzugriff() unten.
export async function requireAdmin() {
  const session = await requireSession();
  if (!session.user.istAdmin && !session.user.istAdminLesend) {
    redirect("/profil");
  }
  return session;
}

// Muss am Anfang JEDER schreibenden Server-Action im Admin-Bereich stehen
// (Insert/Update/Delete/Mail-Versand) — anders als requireAdmin() oben lässt
// das hier "nur lesend"-Admins NICHT durch. Wirft statt zu redirecten, da
// Server-Actions (anders als Seiten-Aufrufe) über den bestehenden
// Error-Boundary (siehe app/error.tsx) eine verständliche Fehlermeldung
// zeigen, kein Redirect brauchen.
export async function requireAdminSchreibzugriff() {
  const session = await requireSession();
  if (!session.user.istAdmin) {
    throw new Error(
      "Keine Berechtigung — dieser Zugang ist auf lesenden Zugriff beschränkt."
    );
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
