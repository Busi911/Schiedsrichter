import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl } from "./app-url";

// Outreach-Übergabe: Der Empfänger der Outreach-Mail kann den Verein direkt
// übernehmen — ohne dass Dennis manuell übergeben muss. Der Token ist
// HMAC-signiert (gleiches Prinzip wie outreach-abmelden.ts) und an diesen
// einen Verein gebunden.
//
// Token-Format: <vereinId>.<base64url-signatur>
// Der Link führt auf /outreach/uebergabe/[token] — dort Name + E-Mail
// eingeben, dann gibt es einen Magic-Link zum Einloggen.

const TOKEN_VERSION = "ou1"; // Outreach-Übergabe, Version 1

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

export function outreachUebergabeToken(vereinId: string): string {
  const payload = b64(vereinId);
  return `${payload}.${signatur(payload)}`;
}

export function pruefeOutreachUebergabeToken(token: string): string | null {
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

export function outreachUebergabeUrl(vereinId: string): string {
  return `${appUrl()}/outreach/uebergabe/${outreachUebergabeToken(vereinId)}`;
}
