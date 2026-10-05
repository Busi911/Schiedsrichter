import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { holeTreuhandKontext } from "@/lib/treuhand";
import { markiereAktivitaet } from "@/lib/aktivitaet";

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

// Session mit Vereinskontext: Ein Systemadmin hat keine vereinId. Arbeitet er
// als Treuhänder (Einrichtung) oder mit Support-Freigabe in einem Verein
// (siehe lib/treuhand.ts), bekommt er hier für genau diesen Verein die
// Rechte eines vollen Vereinsadmins. Der Kontext liegt in der DB, nicht im
// JWT — Übergabe und Widerruf wirken daher sofort.
export async function holeKontextSession() {
  const session = await auth();
  if (session?.user?.istSystemAdmin && !session.user.vereinId) {
    const kontext = await holeTreuhandKontext(session.user.id);
    if (kontext) {
      session.user.vereinId = kontext.vereinId;
      session.user.istAdmin = true;
      session.user.treuhand = kontext.art;
    }
  }
  return session;
}

export async function requireSession() {
  const session = await holeKontextSession();
  if (!session?.user?.vereinId) {
    redirect("/login");
  }
  erzwingePasswortAenderungFallsNoetig(session.user.mussPasswortAendern);
  // Aktivität des Vereinsmitglieds festhalten — nicht die eines Systemadmins, der als Treuhänder/Support im Verein arbeitet.
  if (!session.user.treuhand && !session.user.istSystemAdmin) markiereAktivitaet(session.user.id);
  return session;
}

// Erzwingt die AVV-Zustimmung (Art. 28 DSGVO, siehe /admin/avv) beim ersten
// Login des VOLLEN Vereinsadmins — nur er vertritt den Verein rechtlich,
// eine "nur lesend"-Admin-Rolle wird hier bewusst NICHT gefragt (siehe
// istAdminLesend-Ausnahme in requireAdmin unten). /admin/avv selbst prüft
// die Session direkt über auth() statt requireAdmin(), sonst gäbe es hier
// eine Redirect-Schleife (analog zu erzwingePasswortAenderungFallsNoetig
// oben).
async function erzwingeAvvZustimmungFallsNoetig(vereinId: string) {
  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
      columns: { avvAkzeptiertAm: true },
    })
  );
  if (!verein?.avvAkzeptiertAm) {
    redirect("/admin/avv");
  }
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
  // Die AVV muss der Vereinsadmin selbst zustimmen — nicht der Treuhänder.
  if (session.user.istAdmin && !session.user.treuhand) {
    await erzwingeAvvZustimmungFallsNoetig(session.user.vereinId!);
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
