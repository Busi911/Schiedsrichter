import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereinKontakt } from "@/db/schema";
import { appUrl } from "./app-url";

// Outreach-Abmeldung: Ein Empfänger der automatischen Vereins-Ansprache kann
// sich mit einem Klick abmelden — ohne Login, ohne Registrierung. Der Token
// ist HMAC-signiert (gleiches Prinzip wie abmelden.ts, aber unabhängig von
// der users-Tabelle, weil Outreach-Empfänger noch keine User sind).
//
// Token-Format: <vereinId>.<base64url-signatur>
// Der Token ist an DIESEN Verein gebunden — wenn derselbe Verein später
// regulär registriert wird, gilt die Abmeldung weiterhin (die Spalte
// outreach_abgemeldet_am bleibt gesetzt).

const TOKEN_VERSION = "o1"; // Outreach-Abmeldung, Version 1

function geheimnis(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET ist nicht gesetzt.");
  return s;
}

function signatur(payload: string): string {
  return createHmac("sha256", geheimnis())
    .update(`${TOKEN_VERSION}:${payload}`)
    .digest("base64url")
    .slice(0, 32);
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function unb64(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export function outreachAbmeldeToken(vereinId: string): string {
  const payload = b64(vereinId);
  return `${payload}.${signatur(payload)}`;
}

export function pruefeOutreachAbmeldeToken(token: string): string | null {
  const teile = token.split(".");
  if (teile.length !== 2) return null;
  const [payload, sig] = teile;
  const erwartet = Buffer.from(signatur(payload));
  const gegeben = Buffer.from(sig);
  if (erwartet.length !== gegeben.length || !timingSafeEqual(erwartet, gegeben)) return null;
  const vereinId = unb64(payload);
  if (!/^[0-9a-f-]{36}$/i.test(vereinId)) return null;
  return vereinId;
}

export function outreachAbmeldeUrl(vereinId: string): string {
  return `${appUrl()}/api/outreach/abmelden/${outreachAbmeldeToken(vereinId)}`;
}

export async function fuehreOutreachAbmeldungAus(token: string): Promise<{ verein: string; ok: boolean }> {
  const vereinId = pruefeOutreachAbmeldeToken(token);
  if (!vereinId) return { verein: "", ok: false };
  await adminDb
    .update(vereinKontakt)
    .set({ outreachAbgemeldetAm: new Date() })
    .where(eq(vereinKontakt.vereinId, vereinId));
  return { verein: vereinId, ok: true };
}
