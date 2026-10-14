import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users, vereine, vereinProtokoll } from "@/db/schema";
import { emailAlsHtml, emailAlsText } from "./email-layout";
import { sendMail } from "./mailer";
import { schreibeProtokoll } from "./treuhand";
import { ersteSchritteInhalt } from "./willkommens-mail";

// Einmalige Rundmail "Erste Schritte" an die Admins aller AKTIVEN Vereine (ausgelöst unter /system/mail).
// "Einmalig" je Verein über den Protokolleintrag ERSTE_SCHRITTE_AKTION: ein erneuter Klick schickt nur an Vereine,
// die noch keine bekommen haben (z.B. neu aktiv gewordene oder bei denen der Versand fehlschlug).
export const ERSTE_SCHRITTE_AKTION = "erste_schritte_mail";
export const ERSTE_SCHRITTE_BETREFF = "HandballerPate: Erste Schritte für euren Verein";

type Empfaengerverein = { vereinId: string; vereinName: string; adminEmails: string[] };

async function offeneVereine(): Promise<{ offen: Empfaengerverein[]; schonGesendet: number }> {
  const aktive = await adminDb
    .select({ id: vereine.id, name: vereine.name })
    .from(vereine)
    // Demo-Verein ist nie aktiv (bleibt "vorbereitung"), trotzdem ausdrücklich ausgeschlossen.
    .where(and(eq(vereine.status, "aktiv"), eq(vereine.istDemo, false)));
  if (aktive.length === 0) return { offen: [], schonGesendet: 0 };
  const ids = aktive.map((v) => v.id);
  const [gesendet, admins] = await Promise.all([
    adminDb
      .selectDistinct({ vereinId: vereinProtokoll.vereinId })
      .from(vereinProtokoll)
      .where(and(eq(vereinProtokoll.aktion, ERSTE_SCHRITTE_AKTION), inArray(vereinProtokoll.vereinId, ids))),
    adminDb
      .select({ vereinId: users.vereinId, email: users.email })
      .from(users)
      .where(and(eq(users.istAdmin, true), inArray(users.vereinId, ids))),
  ]);
  const schon = new Set(gesendet.map((g) => g.vereinId));
  const offen = aktive
    .filter((v) => !schon.has(v.id))
    .map((v) => ({
      vereinId: v.id,
      vereinName: v.name,
      adminEmails: admins.filter((a) => a.vereinId === v.id).map((a) => a.email),
    }))
    .filter((v) => v.adminEmails.length > 0);
  return { offen, schonGesendet: schon.size };
}

export async function holeErsteSchritteRundmailStand() {
  const { offen, schonGesendet } = await offeneVereine();
  return {
    offeneVereine: offen.length,
    offeneEmpfaenger: offen.reduce((n, v) => n + v.adminEmails.length, 0),
    schonGesendet,
  };
}

export async function sendeErsteSchritteRundmail(akteur: string) {
  const { offen } = await offeneVereine();
  let vereineGesendet = 0;
  let mails = 0;
  const fehler: string[] = [];
  for (const v of offen) {
    const inhalt = ersteSchritteInhalt(v.vereinName);
    const erreicht: string[] = [];
    for (const email of v.adminEmails) {
      try {
        await sendMail(email, ERSTE_SCHRITTE_BETREFF, emailAlsText(inhalt), emailAlsHtml(inhalt));
        erreicht.push(email);
        mails++;
      } catch (err) {
        console.error("Erste-Schritte-Mail fehlgeschlagen:", v.vereinName, err);
        fehler.push(`${v.vereinName} (${email})`);
      }
    }
    // Nur als "gesendet" markieren, wenn mindestens ein Admin die Mail bekommen hat — sonst beim nächsten Klick erneut.
    if (erreicht.length > 0) {
      await schreibeProtokoll(v.vereinId, ERSTE_SCHRITTE_AKTION, akteur, `an ${erreicht.length} Admin(s)`);
      vereineGesendet++;
    }
  }
  return { vereineGesendet, mails, fehler };
}
