import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { pushAbos } from "@/db/schema";

let konfiguriert = false;

// VAPID-Keys erzeugen: `npx web-push generate-vapid-keys` (siehe README).
// Ohne konfigurierte Keys bleibt Push schlicht inaktiv — kein harter Fehler,
// damit der Rest der App (E-Mail-Erinnerungen etc.) unabhängig davon läuft.
function vapidKonfiguriert(): boolean {
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    return false;
  }
  if (!konfiguriert) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    konfiguriert = true;
  }
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * Sendet eine Push-Benachrichtigung an alle Geräte-Abos eines Nutzers
 * (best effort — ein einzelnes fehlgeschlagenes Gerät bricht die anderen
 * nicht ab). Abgelaufene Abos (410 Gone / 404) werden dabei bereinigt.
 * Nutzt adminDb, da der Aufrufer (Terminerinnerungen-Cron) bereits
 * vereinsübergreifend mit userId statt Tenant-Kontext arbeitet.
 */
export async function sendePushAn(userId: string, payload: PushPayload) {
  if (!vapidKonfiguriert()) return;

  const abos = await adminDb.query.pushAbos.findMany({
    where: eq(pushAbos.userId, userId),
  });
  if (abos.length === 0) return;

  await Promise.all(
    abos.map(async (abo) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: abo.endpoint,
            keys: { p256dh: abo.p256dh, auth: abo.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await adminDb.delete(pushAbos).where(eq(pushAbos.id, abo.id));
        }
      }
    })
  );
}
