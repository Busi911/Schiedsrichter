import { pruefeCronSecret } from "@/lib/cron-auth";
import { SPORTDE_LIGEN, type SportDeLiga } from "@/lib/sources/match";
import { synchronisiereSportDeLiga } from "@/lib/sources/sportde/lauf";

export const maxDuration = 60;

// 1./2. Handball-Bundesliga von sport.de (öffentliches HTML), je Aufruf EINE Liga: ?liga=hbl1|hbl2 (Pflicht), ?voll=1 holt alle 34 Spieltagsseiten neu
// (nachts). Holt nur fällige Spieltagsseiten (Erstimport nach und nach, Spieltage mit Spielen alle 10 Minuten, der Rest selten) und tut NICHTS, solange
// kein Team einem Verein zugeordnet ist (/system/sportde).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const liga = params.get("liga");
  if (!liga || !(liga in SPORTDE_LIGEN)) return Response.json({ fehler: "liga=hbl1|hbl2 fehlt" }, { status: 400 });
  const ergebnis = await synchronisiereSportDeLiga(liga as SportDeLiga, { voll: params.get("voll") === "1", frist: Date.now() + 45_000 });
  return Response.json({ ergebnis });
}
