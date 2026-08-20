import "server-only";
import { eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { termine, users, vereine } from "@/db/schema";
import {
  findeSpielDuplikate,
  type MoeglichesDuplikat,
  type MoeglichesIcsDuplikat,
} from "./duplikat-erkennung";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatumZeitLang } from "./format";
import { appUrl } from "./app-url";

function rundenspielDuplikatZeile(d: MoeglichesDuplikat): string {
  const quelle = [formatDatumZeitLang(d.quellStart), d.quellBeschreibung]
    .filter(Boolean)
    .join(" · ");
  const ziel = [formatDatumZeitLang(d.rundenspielStart), d.rundenspielBeschreibung]
    .filter(Boolean)
    .join(" · ");
  return `${quelle} — evtl. dasselbe Spiel wie im Hallenspielplan: ${ziel}`;
}

function icsDuplikatZeile(d: MoeglichesIcsDuplikat): string {
  const quelle = [formatDatumZeitLang(d.quellStart), d.quellBeschreibung]
    .filter(Boolean)
    .join(" · ");
  const ics = [formatDatumZeitLang(d.icsStart), d.icsBeschreibung].filter(Boolean).join(" · ");
  return `${quelle} — evtl. dasselbe Spiel wie ein ICS-Schiedsrichter-Termin: ${ics}`;
}

export function duplikatBenachrichtigungInhalt(
  vereinName: string,
  zeilen: string[]
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `${zeilen.length} möglich${zeilen.length === 1 ? "es" : "e"} Duplikat${zeilen.length === 1 ? "" : "e"} bei von dir angelegten Terminen gefunden.`,
    zeilen,
    cta: { text: "Zu den Terminen", url: `${appUrl()}/admin/termine` },
  };
}

// Läuft nach jedem automatischen Sync (nuLiga-Import UND ICS-Feed-Sync, siehe
// rundenspiel-sync.ts bzw. api/cron/ics-sync/route.ts) — informiert gezielt
// den Admin, der den betroffenen Termin manuell angelegt hat (termine.
// erstelltVon), statt wie bei rundenspiel-benachrichtigung.ts alle Admins
// pauschal zu benachrichtigen. Ist kein Ersteller bekannt (z.B. gelöschter
// Account), bleibt der Fund nur auf /admin/termine sichtbar, ohne Mail
// (bewusste Entscheidung: lieber keine Mail als eine an die falsche Person).
// Best effort, kein eigenes Opt-in nötig — die Mail geht ohnehin nur an die
// Person, deren eigener Termin betroffen ist, kein Digest an Dritte.
export async function sendeDuplikatBenachrichtigungen(
  vereinId: string
): Promise<{ versendet: number }> {
  const { rundenspielDuplikate, icsDuplikate } = await findeSpielDuplikate(vereinId);

  const proAdmin = new Map<string, { quellIds: Set<string>; zeilen: string[] }>();
  function eintragen(adminId: string, quellId: string, zeile: string) {
    const eintrag = proAdmin.get(adminId) ?? { quellIds: new Set(), zeilen: [] };
    eintrag.quellIds.add(quellId);
    eintrag.zeilen.push(zeile);
    proAdmin.set(adminId, eintrag);
  }

  for (const d of rundenspielDuplikate) {
    if (!d.quellErstelltVon || d.quellDuplikatGemeldetAm) continue;
    eintragen(d.quellErstelltVon, d.quellId, rundenspielDuplikatZeile(d));
  }
  for (const d of icsDuplikate) {
    if (!d.quellErstelltVon || d.quellDuplikatGemeldetAm) continue;
    eintragen(d.quellErstelltVon, d.quellId, icsDuplikatZeile(d));
  }
  if (proAdmin.size === 0) return { versendet: 0 };

  return withTenant(vereinId, async (tx) => {
    const verein = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
    if (!verein) return { versendet: 0 };

    const admins = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, [...proAdmin.keys()]));
    const emailById = new Map(admins.map((a) => [a.id, a.email]));

    let versendet = 0;
    for (const [adminId, eintrag] of proAdmin) {
      const email = emailById.get(adminId);
      if (!email) continue;

      const inhalt = duplikatBenachrichtigungInhalt(verein.name, eintrag.zeilen);
      const betreff = `${eintrag.zeilen.length} möglich${eintrag.zeilen.length === 1 ? "es" : "e"} Termin-Duplikat${eintrag.zeilen.length === 1 ? "" : "e"} bei ${verein.name}`;
      try {
        await sendMail(email, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
      } catch {
        // Best effort — bleibt ungemeldet und wird beim nächsten Sync erneut versucht.
        continue;
      }

      await tx
        .update(termine)
        .set({ duplikatGemeldetAm: new Date() })
        .where(inArray(termine.id, [...eintrag.quellIds]));
      versendet++;
    }

    return { versendet };
  });
}
