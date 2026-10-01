import { and, eq, inArray, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { ligaMannschaften, ligaVereine, vereine as vereineTabelle } from "@/db/schema";
import {
  hatErgebnis,
  holeMannschaften,
  istAnstehend,
  sortiereChronologisch,
  type SpielAnsicht,
} from "@/lib/liga-oeffentlich";
import { pruefeVorschauToken, VORSCHAU_COOKIE } from "@/lib/verein-vorschau";

// Öffentliche Daten zu den auf dem Gerät gemerkten Favoriten (die IDs kommen
// aus dem localStorage des Browsers). Liefert nur öffentliche Sportdaten.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 50;

const spielKurz = (s: SpielAnsicht, eigenTeamtable: string | null) => ({
  datum: s.datum,
  uhrzeit: s.uhrzeit,
  halle: s.halleName,
  heim: s.heimName,
  gast: s.gastName,
  eigenHeim: eigenTeamtable !== null && s.heimTeamtableId === eigenTeamtable,
  tore: hatErgebnis(s) ? { heim: s.toreHeim, gast: s.toreGast } : null,
  vorlaeufig: hatErgebnis(s) && !s.ergebnisBestaetigt,
  status: s.status,
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ids = (name: string) =>
    (params.get(name) ?? "")
      .split(",")
      .filter((x) => UUID.test(x))
      .slice(0, MAX);
  const mannschaftIds = ids("m");
  const vereinIds = ids("v");

  const zeilen = mannschaftIds.length
    ? await mitColdStartRetry(() =>
        adminDb.query.ligaMannschaften.findMany({
          where: inArray(ligaMannschaften.id, mannschaftIds),
          columns: { id: true, ligaVereinId: true },
        })
      )
    : [];
  // Verein in Vorbereitung, für den der Besucher einen gültigen Vorschau-Link
  // eingelöst hat (Cookie): funktioniert wie ein öffentlicher Verein.
  const vorschauVereinId =
    (await pruefeVorschauToken((await cookies()).get(VORSCHAU_COOKIE)?.value))?.vereinId ?? null;
  const noetigeVereine = [...new Set([...vereinIds, ...zeilen.map((z) => z.ligaVereinId)])];
  const vereine = noetigeVereine.length
    ? (
        await mitColdStartRetry(() =>
          adminDb
            .select({ v: ligaVereine })
            .from(ligaVereine)
            .innerJoin(vereineTabelle, eq(vereineTabelle.id, ligaVereine.vereinId))
            // Vereine im Vorbereitungs-Modus sind nicht öffentlich — außer mit
            // gültigem Vorschau-Link (nur dieser eine Verein).
            .where(
              and(
                inArray(ligaVereine.id, noetigeVereine),
                or(
                  eq(vereineTabelle.status, "aktiv"),
                  vorschauVereinId ? eq(vereineTabelle.id, vorschauVereinId) : undefined
                )
              )
            )
        )
      ).map((r) => r.v)
    : [];

  const jetzt = new Date();
  const mannschaften = [];
  const vereineAntwort = [];

  for (const verein of vereine) {
    const liste = await holeMannschaften(verein.id);

    for (const m of liste) {
      if (!mannschaftIds.includes(m.id)) continue;
      const letztes = [...m.spiele].reverse().find(hatErgebnis) ?? null;
      mannschaften.push({
        id: m.id,
        name: m.name,
        verein: { name: verein.name, slug: verein.slug },
        slug: m.slug,
        ligaName: m.ligaName,
        rang: m.istMeldeliste ? null : m.rang,
        punkte: m.istMeldeliste ? null : m.punkte,
        naechstes: m.naechstesSpiel ? spielKurz(m.naechstesSpiel, m.teamtableId) : null,
        letztes: letztes ? spielKurz(letztes, m.teamtableId) : null,
      });
    }

    if (vereinIds.includes(verein.id)) {
      const spiele = new Map<string, { spiel: SpielAnsicht; team: string; tt: string | null }>();
      for (const m of liste) {
        for (const s of m.spiele) {
          if (istAnstehend(s, jetzt) && !spiele.has(s.id)) {
            spiele.set(s.id, { spiel: s, team: m.name, tt: m.teamtableId });
          }
        }
      }
      const naechste = sortiereChronologisch([...spiele.values()].map((e) => e.spiel))
        .slice(0, 3)
        .map((s) => {
          const e = spiele.get(s.id)!;
          return { team: e.team, ...spielKurz(s, e.tt) };
        });
      vereineAntwort.push({ id: verein.id, name: verein.name, slug: verein.slug, naechste });
    }
  }

  // Enthält die Antwort einen Vorschau-Verein, darf sie nicht im gemeinsamen
  // Cache landen (die URL ist für alle gleich, der Zugriff hängt am Cookie).
  const mitVorschau = !!vorschauVereinId && vereine.some((v) => v.vereinId === vorschauVereinId);
  return Response.json(
    { mannschaften, vereine: vereineAntwort },
    {
      headers: {
        "Cache-Control": mitVorschau ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
