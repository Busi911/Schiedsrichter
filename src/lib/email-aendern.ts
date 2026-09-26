import "server-only";
import { eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import type { EmailInhalt } from "@/lib/email-layout";

// Gemeinsam für admin/actions.ts (updateFunktionstraeger, sofortige Änderung
// durch den Admin) und profil/actions.ts + profil/email-bestaetigen/[token]
// (Selbstverwaltung mit Bestätigungslink) — users.email ist GLOBAL eindeutig
// (schema.ts), nicht pro Verein. Räumt dabei eine verwaiste Zeile aus einem
// abgebrochenen Magic-Link-Login-Versuch (vereinId === null, siehe Kommentar
// bei createFunktionstraeger in admin/actions.ts) automatisch weg, statt sie
// fälschlich als Kollision zu werten.
export async function pruefeEmailVerfuegbar(
  tx: typeof Db,
  neueEmail: string,
  ausgenommenUserId: string
) {
  const belegt = await tx.query.users.findFirst({
    where: eq(users.email, neueEmail),
  });
  if (!belegt || belegt.id === ausgenommenUserId) return;
  if (belegt.vereinId !== null) {
    throw new Error(
      "Diese E-Mail-Adresse wird bereits von einem anderen Zugang verwendet."
    );
  }
  await tx.delete(users).where(eq(users.id, belegt.id));
}

export function emailGeaendertInhalt(
  vereinName: string,
  neueEmail: string,
  istNeueAdresse: boolean
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Deine E-Mail-Adresse wurde geändert.",
    zeilen: istNeueAdresse
      ? [`Du kannst dich ab sofort mit ${neueEmail} einloggen.`]
      : [
          `Dein Zugang läuft jetzt über ${neueEmail}.`,
          "Falls das nicht du warst bzw. dir diese Änderung nicht bekannt vorkommt, melde dich bitte beim Vereinsadmin.",
        ],
    cta: istNeueAdresse
      ? { text: "Zum Login", url: `${appUrl()}/login` }
      : undefined,
  };
}
