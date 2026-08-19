import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import type { RundenspielAenderung } from "./rundenspiel-sync";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatumZeitLang } from "./format";
import { appUrl } from "./app-url";

function aenderungsArt(a: RundenspielAenderung): string {
  if (a.verlegt && a.ergebnisNeu) return "verlegt, Ergebnis eingetragen";
  if (a.verlegt) return "verlegt";
  return "Ergebnis eingetragen";
}

export function rundenspielAenderungZeile(a: RundenspielAenderung): string {
  const spiel = `${a.heimMannschaft} – ${a.auswaertsMannschaft}`;
  const zusatz = [formatDatumZeitLang(a.start), a.ort].filter(Boolean).join(" · ");
  return `${spiel} (${zusatz}) — ${aenderungsArt(a)}`;
}

export function rundenspielAenderungenInhalt(
  vereinName: string,
  aenderungen: RundenspielAenderung[]
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `${aenderungen.length} Änderung${aenderungen.length === 1 ? "" : "en"} im Hallenspielplan.`,
    zeilen: aenderungen.map(rundenspielAenderungZeile),
    cta: {
      text: "Zum Hallenspielplan",
      url: `${appUrl()}/admin/termine?tab=rundenspiele`,
    },
  };
}

// Wird nach jedem automatischen nuLiga-Sync aufgerufen (siehe
// synchronisiereAlleAktivenNuligaVereine in rundenspiel-sync.ts) — nur wenn
// der Vereinsadmin das per Opt-in aktiviert hat (siehe
// vereine.rundenspielAenderungenBenachrichtigungAktiviert, einstellbar auf
// /admin/einstellungen), da nicht jeder Verein diesen zusätzlichen Kanal
// will.
export async function sendeRundenspielAenderungenBenachrichtigung(
  verein: { id: string; name: string; rundenspielAenderungenBenachrichtigungAktiviert: boolean },
  aenderungen: RundenspielAenderung[]
): Promise<{ versendet: number }> {
  if (!verein.rundenspielAenderungenBenachrichtigungAktiviert || aenderungen.length === 0) {
    return { versendet: 0 };
  }

  const admins = await adminDb
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.vereinId, verein.id), eq(users.istAdmin, true)));
  if (admins.length === 0) return { versendet: 0 };

  const inhalt = rundenspielAenderungenInhalt(verein.name, aenderungen);
  const betreff = `${aenderungen.length} Änderung${aenderungen.length === 1 ? "" : "en"} im Hallenspielplan bei ${verein.name}`;

  let versendet = 0;
  for (const admin of admins) {
    await sendMail(admin.email, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
    versendet++;
  }
  return { versendet };
}
