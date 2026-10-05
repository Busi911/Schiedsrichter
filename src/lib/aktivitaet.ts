import "server-only";
import { sql } from "drizzle-orm";
import { after } from "next/server";
import { adminDb } from "@/db/admin";

// "Zuletzt aktiv" einer Person (users.letzte_aktivitaet_am), für die Vereins-Gesundheit des Systemadmins. Eine einzige,
// bedingte Anweisung: schreibt höchstens alle 5 Minuten (sonst ändert sie keine Zeile) und läuft NACH der Antwort
// (`after`), verzögert also keine Seite. Best-effort: ein Fehler wird nur protokolliert.
const MINDESTABSTAND_MINUTEN = 5;

export function markiereAktivitaet(userId: string): void {
  const lauf = () =>
    adminDb
      .execute(
        sql`update "user" set "letzte_aktivitaet_am" = now()
            where "id" = ${userId}
            and ("letzte_aktivitaet_am" is null or "letzte_aktivitaet_am" < now() - make_interval(mins => ${MINDESTABSTAND_MINUTEN}))`
      )
      .catch((err) => console.error("letzte_aktivitaet_am konnte nicht aktualisiert werden:", err));
  try {
    after(lauf);
  } catch {
    // Außerhalb einer Anfrage (z.B. in Tests) gibt es kein after(): dann nichts tun.
  }
}
