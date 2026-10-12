import { istZwischenstand } from "@/lib/liga-spiel-status";
import { and, eq, inArray, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { ligaMannschaften, ligaVereine, vereine as vereineTabelle } from "@/db/schema";
import {
  ergebnisHinweis,
  hatErgebnis,
  holeMannschaftenGesammelt,
  letztesErgebnis,
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
  // Zwischenstände (laufendes Spiel, Ergebnis noch nicht genehmigt) nie als Ergebnis ausliefern
  tore: hatErgebnis(s) && !istZwischenstand(s, new Date()) ? { heim: s.toreHeim, gast: s.toreGast } : null,
  vorlaeufig: hatErgebnis(s) && !s.ergebnisBestaetigt,
  status: s.status,
  // "laeuft" | "ergebnis_folgt" | "ausstehend" | null — statt einer Zahl
  hinweis: ergebnisHinweis(s, new Date()),
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

  // EINE Abfragefolge für alle Favoriten (statt je Verein eine komplette Saison nacheinander zu laden).
  const erlaubt = new Set(vereine.map((v) => v.id));
  const vereinsFavoriten = vereinIds.filter((id) => erlaubt.has(id));
  const teamFavoriten = zeilen.filter((z) => erlaubt.has(z.ligaVereinId)).map((z) => z.id);
  const alle = await holeMannschaftenGesammelt(vereinsFavoriten, teamFavoriten);
  const vereinNach = new Map(vereine.map((v) => [v.id, v] as const));

  for (const m of alle) {
    if (!mannschaftIds.includes(m.id)) continue;
    const verein = vereinNach.get(m.ligaVereinId);
    if (!verein) continue;
    const letztes = letztesErgebnis(m.spiele, jetzt);
    mannschaften.push({
      id: m.id,
      name: m.name,
      verein: { name: verein.name, slug: verein.slug },
      slug: m.slug,
      ligaName: m.ligaName,
      rang: m.istMeldeliste ? null : m.rang,
      punkte: m.istMeldeliste ? null : m.punkte,
      naechstes: m.naechstesSpiel ? spielKurz(m.naechstesSpiel, m.teamtableId) : null,
      // Die nächsten Spiele (für "Als Nächstes" auf /meine, über alle Favoriten hinweg sortiert).
      naechste: m.spiele
        .filter((s) => istAnstehend(s, jetzt))
        .slice(0, 3)
        .map((s) => spielKurz(s, m.teamtableId)),
      letztes: letztes ? spielKurz(letztes, m.teamtableId) : null,
    });
  }

  for (const verein of vereine) {
    if (!vereinIds.includes(verein.id)) continue;
    const spiele = new Map<string, { spiel: SpielAnsicht; team: string; tt: string | null }>();
    for (const m of alle) {
      if (m.ligaVereinId !== verein.id) continue;
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
