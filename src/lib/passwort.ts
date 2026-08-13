import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { users } from "@/db/schema";

const scryptAsync = promisify(scrypt);
const SCHLUESSEL_LAENGE = 64;

// "salt:hash" (beide hex-kodiert) statt zwei getrennter Spalten — genug für
// scrypt, kein zusätzliches Schema-Feld nötig.
export async function hashePasswort(passwort: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(passwort, salt, SCHLUESSEL_LAENGE)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function pruefePasswort(
  passwort: string,
  gespeicherterHash: string
): Promise<boolean> {
  const [salt, hashHex] = gespeicherterHash.split(":");
  if (!salt || !hashHex) return false;
  const hash = (await scryptAsync(passwort, salt, SCHLUESSEL_LAENGE)) as Buffer;
  const gespeichert = Buffer.from(hashHex, "hex");
  // timingSafeEqual verlangt gleiche Länge — ein Längen-Mismatch ist per se
  // schon "falsch", nicht extra behandlungswürdig.
  if (hash.length !== gespeichert.length) return false;
  return timingSafeEqual(hash, gespeichert);
}

// Gut lesbar/eintippbar (z.B. aus einer Mail abgetippt): keine
// verwechselbaren Zeichen (0/O, 1/l/I).
const EINMAL_PASSWORT_ZEICHEN =
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generiereEinmalPasswort(laenge = 12): string {
  const bytes = randomBytes(laenge);
  let ergebnis = "";
  for (let i = 0; i < laenge; i++) {
    ergebnis += EINMAL_PASSWORT_ZEICHEN[bytes[i] % EINMAL_PASSWORT_ZEICHEN.length];
  }
  return ergebnis;
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

// Vergibt EINMALIG ein Einmal-Passwort, wenn die Person noch keins hat —
// gibt das Klartext-Passwort zum Versenden per Mail zurück, oder null, wenn
// schon eins gesetzt ist (dann nicht zurücksetzen, z.B. weil die Person es
// zwischenzeitlich selbst geändert hat oder schon vorher eins bekam).
export async function vergebeEinmalPasswortFallsNoetig(
  tx: Tx,
  userId: string,
  bisherigerHash: string | null
): Promise<string | null> {
  if (bisherigerHash) return null;
  const einmalPasswort = generiereEinmalPasswort();
  const hash = await hashePasswort(einmalPasswort);
  await tx
    .update(users)
    .set({ passwordHash: hash, mussPasswortAendern: true })
    .where(eq(users.id, userId));
  return einmalPasswort;
}
