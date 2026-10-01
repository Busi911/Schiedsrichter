import "server-only";
import { cache } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { treuhandZugriffe, users, vereine, vereinProtokoll } from "@/db/schema";

// Treuhand: Der Systemadmin richtet einen Verein im Hintergrund ein
// ("vorbereitung": unsichtbar, keine Mails) und übergibt ihn danach an den
// echten Vereinsadmin — mit der Übergabe endet jeder Zugriff des Systemadmins.
// Späterer Support-Zugriff geht nur, wenn der Vereinsadmin ihn ausdrücklich
// und befristet freigibt. Alles läuft über adminDb (systemweit, kein RLS);
// jede Aktion wird in verein_protokoll festgehalten.

export type TreuhandArt = "einrichtung" | "support";
export const SUPPORT_TAGE = [1, 3, 7] as const;
const TAG_MS = 24 * 60 * 60 * 1000;

// Liegt eine laufende Support-Freigabe vor? (Eigene Funktion, damit Seiten
// nicht Date.now() im Render aufrufen.)
export function supportFreigabeAktiv(bis: Date | null): bis is Date {
  return !!bis && bis.getTime() > Date.now();
}

export type TreuhandKontext = { vereinId: string; vereinName: string; art: TreuhandArt };

export async function schreibeProtokoll(
  vereinId: string,
  aktion: string,
  akteur: string | null,
  details?: string
) {
  await adminDb.insert(vereinProtokoll).values({ vereinId, aktion, akteur, details: details ?? null });
}

// Aktueller Vereinskontext des Systemadmins — prüft bei JEDEM Aufruf, ob er
// noch gilt (Einrichtung nur im Vorbereitungs-Modus, Support nur bei
// laufender Freigabe). Ungültige Kontexte werden sofort entfernt, so wirken
// Widerruf und Ablauf unmittelbar (anders als eine Rolle im JWT).
async function ladeKontext(userId: string): Promise<TreuhandKontext | null> {
  const [zeile] = await adminDb
    .select({ z: treuhandZugriffe, v: vereine })
    .from(treuhandZugriffe)
    .innerJoin(vereine, eq(vereine.id, treuhandZugriffe.vereinId))
    .where(eq(treuhandZugriffe.systemAdminUserId, userId))
    .limit(1);
  if (!zeile) return null;
  const { z, v } = zeile;
  const gueltig =
    z.art === "einrichtung"
      ? v.status === "vorbereitung"
      : v.status === "aktiv" && supportFreigabeAktiv(v.supportZugriffBis);
  if (!gueltig) {
    await adminDb.delete(treuhandZugriffe).where(eq(treuhandZugriffe.id, z.id));
    return null;
  }
  return { vereinId: v.id, vereinName: v.name, art: z.art };
}
export const holeTreuhandKontext = cache(ladeKontext);

async function pruefeSystemAdmin(userId: string) {
  const [u] = await adminDb
    .select({ istSystemAdmin: users.istSystemAdmin, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!u?.istSystemAdmin) throw new Error("Nur Systemadmins dürfen das.");
  return u.name ?? u.email;
}

export async function vereinVorbereiten(userId: string, vereinsname: string): Promise<string> {
  const akteur = await pruefeSystemAdmin(userId);
  const name = vereinsname.trim();
  if (!name) throw new Error("Bitte einen Vereinsnamen angeben.");
  const [neu] = await adminDb
    .insert(vereine)
    .values({ name, status: "vorbereitung" })
    .returning({ id: vereine.id });
  await schreibeProtokoll(neu.id, "vorbereitet", akteur);
  return neu.id;
}

// Wechselt den Systemadmin in einen Verein: "einrichtung" nur im
// Vorbereitungs-Modus, "support" nur bei gültiger Freigabe des Vereins.
export async function starteTreuhand(userId: string, vereinId: string, art: TreuhandArt) {
  const akteur = await pruefeSystemAdmin(userId);
  const [v] = await adminDb.select().from(vereine).where(eq(vereine.id, vereinId));
  if (!v) throw new Error("Verein nicht gefunden.");
  if (art === "einrichtung" && v.status !== "vorbereitung") {
    throw new Error("Dieser Verein ist bereits übergeben.");
  }
  if (art === "support") {
    if (v.status !== "aktiv" || !supportFreigabeAktiv(v.supportZugriffBis)) {
      throw new Error("Für diesen Verein liegt keine gültige Support-Freigabe vor.");
    }
  }
  await adminDb.delete(treuhandZugriffe).where(eq(treuhandZugriffe.systemAdminUserId, userId));
  await adminDb.insert(treuhandZugriffe).values({ systemAdminUserId: userId, vereinId, art });
  await schreibeProtokoll(
    vereinId,
    art === "einrichtung" ? "einrichtung_gestartet" : "support_zugriff",
    akteur,
    art === "support" ? `Freigabe bis ${v.supportZugriffBis!.toISOString()}` : undefined
  );
}

export async function beendeTreuhand(userId: string) {
  await adminDb.delete(treuhandZugriffe).where(eq(treuhandZugriffe.systemAdminUserId, userId));
}

// Übergabe: legt den Vereinsadmin an, schaltet den Verein aktiv/sichtbar und
// löscht JEDEN Treuhand-Zugriff auf diesen Verein — in einer Transaktion.
export async function uebergebeVerein(
  userId: string,
  vereinId: string,
  adminName: string,
  adminEmail: string
): Promise<{ vereinName: string; adminEmail: string }> {
  const akteur = await pruefeSystemAdmin(userId);
  const email = adminEmail.trim().toLowerCase();
  const name = adminName.trim();
  if (!name || !email) throw new Error("Bitte Name und E-Mail des Vereinsadmins angeben.");

  const [v] = await adminDb.select().from(vereine).where(eq(vereine.id, vereinId));
  if (!v) throw new Error("Verein nicht gefunden.");
  if (v.status !== "vorbereitung") throw new Error("Dieser Verein ist bereits übergeben.");

  const [vergeben] = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (vergeben) throw new Error("Diese E-Mail-Adresse ist bereits vergeben.");

  await adminDb.transaction(async (tx) => {
    await tx.insert(users).values({ email, name, vereinId, istAdmin: true });
    await tx
      .update(vereine)
      .set({ status: "aktiv", uebergebenAm: new Date() })
      .where(eq(vereine.id, vereinId));
    await tx.delete(treuhandZugriffe).where(eq(treuhandZugriffe.vereinId, vereinId));
    await tx.insert(vereinProtokoll).values({
      vereinId,
      aktion: "uebergeben",
      akteur,
      details: `an ${email}`,
    });
  });
  return { vereinName: v.name, adminEmail: email };
}

// Vom Vereinsadmin: Support-Zugriff für einige Tage freigeben oder (tage =
// null) sofort widerrufen. Ein Widerruf beendet auch einen laufenden Zugriff.
export async function setzeSupportFreigabe(
  vereinId: string,
  tage: number | null,
  akteur: string
) {
  if (tage !== null && !(SUPPORT_TAGE as readonly number[]).includes(tage)) {
    throw new Error("Ungültige Dauer.");
  }
  if (tage === null) {
    await adminDb.update(vereine).set({ supportZugriffBis: null }).where(eq(vereine.id, vereinId));
    await adminDb.delete(treuhandZugriffe).where(eq(treuhandZugriffe.vereinId, vereinId));
    await schreibeProtokoll(vereinId, "support_widerrufen", akteur);
    return;
  }
  const bis = new Date(Date.now() + tage * TAG_MS);
  await adminDb.update(vereine).set({ supportZugriffBis: bis }).where(eq(vereine.id, vereinId));
  await schreibeProtokoll(vereinId, "support_freigegeben", akteur, `${tage} Tag(e), bis ${bis.toISOString()}`);
}

export async function holeProtokoll(vereinId: string, limit = 15) {
  return adminDb
    .select()
    .from(vereinProtokoll)
    .where(eq(vereinProtokoll.vereinId, vereinId))
    .orderBy(desc(vereinProtokoll.zeitpunkt))
    .limit(limit);
}

// Für den Mailversand: Empfänger, die zu einem Verein im Vorbereitungs-Modus
// gehören, bekommen keine Mails (der Verein ist noch nicht "live").
export async function istEmpfaengerGesperrt(email: string): Promise<boolean> {
  const [treffer] = await adminDb
    .select({ status: vereine.status })
    .from(users)
    .innerJoin(vereine, eq(vereine.id, users.vereinId))
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return treffer?.status === "vorbereitung";
}
