import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereinVorschauLinks } from "@/db/schema";
import { schreibeProtokoll } from "@/lib/treuhand";

// Vorschau für Vereine im Vorbereitungs-Modus: Der Systemadmin erzeugt einen
// geheimen, befristeten und widerrufbaren Link. Wer ihn öffnet, bekommt ein
// Cookie (nur für diesen Verein) und sieht eine eingeschränkte Demo-Ansicht
// (max. VORSCHAU_MAX Einträge je Liste, keine installierbare App, noindex).
import { VORSCHAU_TAGE } from "./verein-vorschau-konstanten";
export { VORSCHAU_MAX, VORSCHAU_TAGE } from "./verein-vorschau-konstanten";
export const VORSCHAU_COOKIE = "hp_vorschau";


const TAG_MS = 24 * 60 * 60 * 1000;

export async function erzeugeVorschauLink(vereinId: string, tage: number, akteur: string) {
  if (!(VORSCHAU_TAGE as readonly number[]).includes(tage)) throw new Error("Ungültige Dauer.");
  const token = randomBytes(24).toString("base64url");
  const gueltigBis = new Date(Date.now() + tage * TAG_MS);
  await adminDb.insert(vereinVorschauLinks).values({ vereinId, token, gueltigBis });
  await schreibeProtokoll(vereinId, "vorschau_link_erzeugt", akteur, `${tage} Tag(e)`);
  return token;
}

export async function widerrufeVorschauLink(id: string, akteur: string) {
  const [z] = await adminDb
    .update(vereinVorschauLinks)
    .set({ widerrufenAm: new Date() })
    .where(and(eq(vereinVorschauLinks.id, id), isNull(vereinVorschauLinks.widerrufenAm)))
    .returning({ vereinId: vereinVorschauLinks.vereinId });
  if (z) await schreibeProtokoll(z.vereinId, "vorschau_link_widerrufen", akteur);
}

// Gültig = nicht widerrufen, nicht abgelaufen. Gibt Verein und Ablauf zurück.
export async function pruefeVorschauToken(token: string | undefined | null) {
  if (!token || token.length > 100) return null;
  const [z] = await adminDb
    .select({ vereinId: vereinVorschauLinks.vereinId, gueltigBis: vereinVorschauLinks.gueltigBis })
    .from(vereinVorschauLinks)
    .where(
      and(
        eq(vereinVorschauLinks.token, token),
        isNull(vereinVorschauLinks.widerrufenAm),
        gt(vereinVorschauLinks.gueltigBis, new Date())
      )
    );
  return z ?? null;
}

export async function holeAktiveVorschauLinks(vereinId: string) {
  return adminDb
    .select()
    .from(vereinVorschauLinks)
    .where(
      and(
        eq(vereinVorschauLinks.vereinId, vereinId),
        isNull(vereinVorschauLinks.widerrufenAm),
        gt(vereinVorschauLinks.gueltigBis, new Date())
      )
    )
    .orderBy(desc(vereinVorschauLinks.erstelltAm));
}
