import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, users, vereine } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { sendMail } from "@/lib/mailer";

// Öffentliche Selbsteintragung der Trainer einer Mannschaft über deren Link (mannschaften.trainerEinladungToken, siehe
// /trainer-eintragen/[token]). Anders als bei der Eintragung für Dienste (lib/zuordnung.ts, loeseIdentitaetPerEmailAuf: sofort aktiv, Wart wird nur informiert) legt der Link nur eine INAKTIVE
// Rolle an — ein Admin schaltet die Person unter /admin/funktionstraeger frei (erst dann geht die Willkommens-Mail raus).

export type TrainerEintragErgebnis = { ok: true; mannschaftName: string } | { ok: false; fehler: string };

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function trainerEintragEingabePruefen(
  nameRoh: unknown,
  emailRoh: unknown
): { name: string; email: string } | { fehler: string } {
  const name = typeof nameRoh === "string" ? nameRoh.trim() : "";
  const email = typeof emailRoh === "string" ? emailRoh.trim().toLowerCase() : "";
  if (!name) return { fehler: "Bitte deinen Namen angeben." };
  if (name.length > 100) return { fehler: "Der Name ist zu lang." };
  if (!email || email.length > 200 || !EMAIL_MUSTER.test(email)) return { fehler: "Bitte eine gültige E-Mail-Adresse angeben." };
  return { name, email };
}

export function trainerAnfrageInhalt(name: string, email: string, mannschaftName: string, cta: { text: string; url: string }): EmailInhalt {
  return {
    ueberschrift: `${name} hat sich über den Trainer-Link als Trainer von ${mannschaftName} eingetragen und wartet auf Freischaltung.`,
    zeilen: [`E-Mail: ${email}`, "Ohne Freischaltung bekommt die Person keinen Zugang."],
    cta,
  };
}

export async function trainerPerTokenEintragen(token: string, nameRoh: unknown, emailRoh: unknown): Promise<TrainerEintragErgebnis> {
  if (!token) return { ok: false, fehler: "Ungültiger Link." };
  const eingabe = trainerEintragEingabePruefen(nameRoh, emailRoh);
  if ("fehler" in eingabe) return { ok: false, fehler: eingabe.fehler };
  const { name, email } = eingabe;

  // Bewusst adminDb nur für den Token-Lookup (keine Session, kein Vereinskontext), danach ausschließlich withTenant.
  const mannschaft = await adminDb.query.mannschaften.findFirst({
    where: eq(mannschaften.trainerEinladungToken, token),
  });
  const verein = mannschaft ? await adminDb.query.vereine.findFirst({ where: eq(vereine.id, mannschaft.vereinId) }) : null;
  if (!mannschaft || !verein) return { ok: false, fehler: "Ungültiger oder nicht mehr aktiver Link." };
  // Der Demo-Verein ist öffentlich: hier würden sonst Konten mit fremden Adressen entstehen.
  if (verein.istDemo) return { ok: false, fehler: "Im Demo-Verein ist die Eintragung nicht möglich." };

  const neuAngelegt = await withTenant(verein.id, async (tx) => {
    let user = await tx.query.users.findFirst({ where: eq(users.email, email) });
    // Gehört die Adresse zu einem anderen Verein, wird NICHTS angelegt — die Antwort bleibt aber dieselbe, damit der Link nicht verrät,
    // welche Adressen bei uns registriert sind.
    if (user && user.vereinId !== verein.id) return false;
    if (!user) [user] = await tx.insert(users).values({ email, name, vereinId: verein.id }).returning();

    const vorhanden = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, user.id),
        eq(funktionstraegerRollen.typ, "trainer"),
        eq(funktionstraegerRollen.mannschaftId, mannschaft.id)
      ),
    });
    if (vorhanden) return false;
    await tx.insert(funktionstraegerRollen).values({ userId: user.id, typ: "trainer", mannschaftId: mannschaft.id, aktiv: false });
    return true;
  });

  if (neuAngelegt) {
    try {
      const admins = await withTenant(verein.id, (tx) =>
        tx.select({ email: users.email }).from(users).where(and(eq(users.vereinId, verein.id), eq(users.istAdmin, true)))
      );
      const inhalt = trainerAnfrageInhalt(name, email, mannschaft.name, {
        text: "Zur Freischaltung",
        url: `${appUrl()}/admin/funktionstraeger?suche=${encodeURIComponent(email)}`,
      });
      for (const admin of admins) {
        try {
          await sendMail(admin.email, "Neuer Trainer wartet auf Freischaltung", emailAlsText(inhalt), emailAlsHtml(inhalt));
        } catch (err) {
          console.error("Trainer-Anfrage-Mail konnte nicht gesendet werden:", err);
        }
      }
    } catch (err) {
      console.error("Admins für Trainer-Anfrage konnten nicht geladen werden:", err);
    }
  }

  return { ok: true, mannschaftName: mannschaft.name };
}
