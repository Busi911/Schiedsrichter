import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { holeVerein, mannschaftsReihenfolge } from "@/lib/liga-oeffentlich";
import { spielGruppe } from "@/lib/liga-spiele-hilfen";
import { berechneMannschaftsKennzahlen, berechneVereinsKennzahlen } from "@/lib/spiel-statistik";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { GefilterteListe } from "@/components/liga/gefilterte-liste";
import { StatistikKarte } from "@/components/liga/statistik-karte";
import { StandHinweis } from "@/components/liga/liga-ui";
import { Card } from "@/components/ui/card";
import { ladeVereinsDaten } from "../laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  return {
    title: `${verein.name} – Statistik | Handballerpate`,
    description: `Bilanz, Tore und Form aller Mannschaften des ${verein.name}.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}/statistik` },
  };
}

export default async function StatistikSeite({ params }: Props) {
  const { slug } = await params;
  const { verein, mannschaften, basis } = await ladeVereinsDaten(slug);
  const jetzt = new Date();
  const reihenfolge = mannschaftsReihenfolge(mannschaften);
  const eintraege = mannschaften
    .map((m) => ({ m, k: berechneMannschaftsKennzahlen(m, jetzt) }))
    .filter((e): e is { m: (typeof mannschaften)[number]; k: NonNullable<ReturnType<typeof berechneMannschaftsKennzahlen>> } => !!e.k)
    // Gleiche Reihenfolge wie auf der Mannschaften-Seite.
    .sort((a, b) => (reihenfolge.get(a.m.id) ?? 999) - (reihenfolge.get(b.m.id) ?? 999));
  const gesamt = berechneVereinsKennzahlen(eintraege.map((e) => e.k));

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <BereichsKopf titel="Statistik" vereinId={verein.id} vereinName={verein.name} />

      {eintraege.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Spiele mit Ergebnis. Sobald die ersten Ergebnisse da sind, erscheint hier die Statistik.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card size="sm" className="gap-0 px-2 py-3">
              <p className="font-heading text-2xl font-bold tabular-nums">{gesamt.spiele}</p>
              <p className="text-xs text-muted-foreground">Spiele</p>
            </Card>
            <Card size="sm" className="gap-0 px-2 py-3">
              <p className="font-heading text-2xl font-bold tabular-nums">{gesamt.siegquote}%</p>
              <p className="text-xs text-muted-foreground">Siegquote</p>
            </Card>
            <Card size="sm" className="gap-0 px-2 py-3">
              <p className="font-heading text-2xl font-bold tabular-nums">
                {gesamt.siege}·{gesamt.unentschieden}·{gesamt.niederlagen}
              </p>
              <p className="text-xs text-muted-foreground">S · U · N</p>
            </Card>
          </div>

          <GefilterteListe
            leerText="Für diese Auswahl gibt es noch keine Statistik."
            eintraege={eintraege.map(({ m, k }) => ({
              id: m.id,
              tag: "Mannschaften",
              gruppe: spielGruppe(m.kategorie),
              mannschaftIds: [m.id],
              knoten: <StatistikKarte name={m.name} href={`${basis}/${m.slug}`} k={k} />,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            Gezählt werden alle Spiele mit Ergebnis (Heim und Auswärts). Laufende Spiele und Nichtantritte zählen nicht.
          </p>
        </>
      )}
      <StandHinweis stand={verein.spieleSynchronisiertAm ?? verein.strukturSynchronisiertAm} />
    </div>
  );
}
