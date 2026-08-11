import "server-only";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import {
  benachrichtigungen,
  funktionstraegerRollen,
  terminZuordnungen,
  termine,
  users,
} from "@/db/schema";
import { sendMail } from "./mailer";
import { sendePushAn } from "./push";

const ERINNERUNG_TYP = "erinnerung_24h";
// Täglicher Cron-Lauf + 36h-Fenster, damit zwischen zwei Läufen keine
// Termine "durchrutschen"; bereits verschickte Erinnerungen werden über die
// benachrichtigung-Tabelle erkannt und nicht doppelt versendet.
const FENSTER_STUNDEN = 36;

type Termin = typeof termine.$inferSelect;

async function ermittleEmpfaenger(termin: Termin) {
  const empfaenger = new Map<string, { id: string; email: string }>();

  if (termin.icsSchiedsrichterId) {
    const schiedsrichter = await adminDb.query.users.findFirst({
      where: eq(users.id, termin.icsSchiedsrichterId),
    });
    if (schiedsrichter) {
      empfaenger.set(schiedsrichter.id, {
        id: schiedsrichter.id,
        email: schiedsrichter.email,
      });
    }
  }

  if (termin.mannschaftId) {
    const trainer = await adminDb
      .select({ id: users.id, email: users.email })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(
          eq(funktionstraegerRollen.typ, "trainer"),
          eq(funktionstraegerRollen.mannschaftId, termin.mannschaftId)
        )
      );
    for (const t of trainer) empfaenger.set(t.id, t);
  }

  // Zeitnehmer/Sekretäre/weitere Schiedsrichter/Ordner/Kioskdienst, die über
  // /admin/zuordnung oder Selbst-Anmeldung einem Termin zugeordnet wurden.
  // Schließt die Lücke bei Testspielen/Turnieren ohne Mannschaft, die sonst
  // (ohne icsSchiedsrichterId und ohne mannschaftId) niemanden erreichen
  // würden, obwohl konkret jemand zugeordnet ist.
  const zugeordnete = await adminDb
    .select({ id: users.id, email: users.email })
    .from(terminZuordnungen)
    .innerJoin(users, eq(terminZuordnungen.userId, users.id))
    .where(
      and(
        eq(terminZuordnungen.terminId, termin.id),
        isNotNull(terminZuordnungen.userId)
      )
    );
  for (const z of zugeordnete) empfaenger.set(z.id, z);

  return [...empfaenger.values()];
}

function erinnerungsText(termin: Termin) {
  const zeitpunkt = termin.start.toLocaleString("de-DE", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const zeilen = [`Erinnerung an deinen Termin am ${zeitpunkt}.`];
  if (termin.ort) zeilen.push(`Ort: ${termin.ort}`);
  if (termin.beschreibung) zeilen.push(termin.beschreibung);
  return zeilen.join("\n");
}

export async function sendeAusstehendeErinnerungen() {
  const jetzt = new Date();
  const bis = new Date(jetzt.getTime() + FENSTER_STUNDEN * 60 * 60 * 1000);

  const anstehendeTermine = await adminDb.query.termine.findMany({
    where: and(gte(termine.start, jetzt), lte(termine.start, bis)),
  });

  let versendet = 0;
  const fehler: { terminId: string; message: string }[] = [];

  for (const termin of anstehendeTermine) {
    const empfaenger = await ermittleEmpfaenger(termin);

    for (const person of empfaenger) {
      const bereitsVersendet = await adminDb.query.benachrichtigungen.findFirst({
        where: and(
          eq(benachrichtigungen.terminId, termin.id),
          eq(benachrichtigungen.userId, person.id),
          eq(benachrichtigungen.typ, ERINNERUNG_TYP)
        ),
      });
      if (bereitsVersendet) continue;

      try {
        await sendMail(
          person.email,
          "Erinnerung: anstehender Termin",
          erinnerungsText(termin)
        );
        // Push ist ein zusätzlicher, best-effort Kanal — ein fehlendes/
        // ungültiges Abo darf den (bereits erfolgreichen) E-Mail-Versand
        // nicht als Fehler markieren, daher eigenes try/catch statt im
        // äußeren Block mitgefangen zu werden.
        try {
          await sendePushAn(person.id, {
            title: "Erinnerung: anstehender Termin",
            body: erinnerungsText(termin),
            url: "/profil",
          });
        } catch {
          // Push-Fehler bewusst ignoriert (siehe sendePushAn: räumt ungültige
          // Abos bereits selbst auf), die E-Mail ist der verlässliche Kanal.
        }
        await withTenant(termin.vereinId, (tx) =>
          tx.insert(benachrichtigungen).values({
            terminId: termin.id,
            userId: person.id,
            typ: ERINNERUNG_TYP,
            versendetAm: new Date(),
          })
        );
        versendet++;
      } catch (err) {
        fehler.push({
          terminId: termin.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { geprueft: anstehendeTermine.length, versendet, fehler };
}
