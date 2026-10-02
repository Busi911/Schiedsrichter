import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import { appUrl } from "./app-url";

// Abbestellbare Mailarten (nur die optionalen Erinnerungs-/Übersichtsmails; Login-Link, Verlegungen
// u.ä. gehören zum Betrieb und sind bewusst NICHT abbestellbar). Jede Art entspricht dem persönlichen
// Schalter unter Profil → Benachrichtigungen.
export const ABMELDE_ARTEN = {
  digest: "die Wochenübersicht deiner Einsätze",
  termin: "die Erinnerung an anstehende Termine",
  "sr-erinnerung": "die Erinnerung an offene Schiedsrichter-Dienste",
  "zn-erinnerung": "die Erinnerung an offene Zeitnehmer-/Sekretär-Dienste",
  broadcast: "die Anfragen zu unbesetzten Diensten",
} as const;
export type AbmeldeArt = keyof typeof ABMELDE_ARTEN;
export const istAbmeldeArt = (x: string): x is AbmeldeArt => Object.hasOwn(ABMELDE_ARTEN, x);

const FELD: Record<AbmeldeArt, (an: boolean) => Partial<typeof users.$inferInsert>> = {
  digest: (an) => ({ wochenDigestAktiviert: an }),
  termin: (an) => ({ terminErinnerungAktiviert: an }),
  "sr-erinnerung": (an) => ({ offeneSchiedsrichterErinnerungAktiviert: an }),
  "zn-erinnerung": (an) => ({ offeneZeitnehmerErinnerungAktiviert: an }),
  broadcast: (an) => ({ offeneDiensteBroadcastAktiviert: an }),
};

function geheimnis(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET ist nicht gesetzt.");
  return s;
}
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const signatur = (payload: string) =>
  createHmac("sha256", geheimnis()).update(`abmelden:${payload}`).digest("base64url").slice(0, 32);

// Persönlicher, nicht erratbarer Link: gilt nur für DIESE Person und DIESE Mailart.
export function abmeldeToken(userId: string, art: AbmeldeArt): string {
  const payload = b64(`${userId}.${art}`);
  return `${payload}.${signatur(payload)}`;
}

export function pruefeAbmeldeToken(token: string): { userId: string; art: AbmeldeArt } | null {
  const [payload, sig, ...rest] = token.split(".");
  if (!payload || !sig || rest.length > 0) return null;
  const erwartet = Buffer.from(signatur(payload));
  const gegeben = Buffer.from(sig);
  if (erwartet.length !== gegeben.length || !timingSafeEqual(erwartet, gegeben)) return null;
  const [userId, art] = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (!userId || !art || !istAbmeldeArt(art)) return null;
  return { userId, art };
}

export const abmeldeUrl = (userId: string, art: AbmeldeArt): string =>
  `${appUrl()}/abmelden/${abmeldeToken(userId, art)}`;

// Für den Mailfuß (sichtbarer Link) und den List-Unsubscribe-Header.
export function abmeldeInfo(userId: string, art: AbmeldeArt): { url: string; text: string } {
  return { url: abmeldeUrl(userId, art), text: `Diese Mails (${ABMELDE_ARTEN[art]}) nicht mehr erhalten:` };
}

export async function setzeAbmeldung(userId: string, art: AbmeldeArt, aktiv: boolean): Promise<void> {
  await adminDb.update(users).set(FELD[art](aktiv)).where(eq(users.id, userId));
}

export async function istAngemeldet(userId: string, art: AbmeldeArt): Promise<boolean | null> {
  const [u] = await adminDb.select().from(users).where(eq(users.id, userId));
  if (!u) return null;
  return {
    digest: u.wochenDigestAktiviert,
    termin: u.terminErinnerungAktiviert,
    "sr-erinnerung": u.offeneSchiedsrichterErinnerungAktiviert,
    "zn-erinnerung": u.offeneZeitnehmerErinnerungAktiviert,
    broadcast: u.offeneDiensteBroadcastAktiviert,
  }[art];
}
