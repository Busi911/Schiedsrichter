import { pruefeCronSecret } from "@/lib/cron-auth";
import { BUNDESLIGEN, type BundesLiga } from "@/lib/sources/match";
import { synchronisiereNdrLiga } from "@/lib/sources/ndr/lauf";

export const maxDuration = 60;

// 1./2. Handball-Bundesliga von ndr.de (öffentliches HTML), je Aufruf EINE Liga: ?liga=hbl1|hbl2 (Pflicht), ?voll=1 holt alle Spieltage neu
// (nachts). Holt nur fällige Spieltage (Erstimport nach und nach, Spieltage mit Spielen alle 10 Minuten, der Rest selten) und tut NICHTS, solange
// kein Team einem Verein zugeordnet ist (/system/ndr).
export async function GET(request: Request) {
  // VORÜBERGEHEND ohne Auth — Testlauf (wird wieder aktiviert)
  // const unauthorized = pruefeCronSecret(request);
  // if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const liga = params.get("liga");
  if (!liga || !(liga in BUNDESLIGEN)) return Response.json({ fehler: "liga=hbl1|hbl2 fehlt" }, { status: 400 });
  const ergebnis = await synchronisiereNdrLiga(liga as BundesLiga, { voll: params.get("voll") === "1", frist: Date.now() + 45_000 });
  return Response.json({ ergebnis });
}
