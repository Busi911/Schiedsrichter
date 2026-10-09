import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import {
  formKurve,
  hatErgebnis,
  holeTabelle,
  istAnstehend,
} from "@/lib/liga-oeffentlich";
import { jsonLdText, mannschaftJsonLd } from "@/lib/liga-seo";
import { FormChips, SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { ladeTeam } from "./laden";

type Props = { params: Promise<{ slug: string; team: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  return {
    title: `${verein.name} ${m.name} – Spielplan, Ergebnisse & Tabelle | HandballerPate`,
    description: `Spielplan, Ergebnisse und Tabelle der Mannschaft ${m.name} (${m.ligaName}) des ${verein.name}.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}/${m.slug}` },
  };
}

export default async function Uebersicht({ params }: Props) {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  const tabelle = m.istMeldeliste ? [] : await holeTabelle(m.gruppeId);
  const zeile = tabelle.find((z) => z.nuligaTeamtableId === m.teamtableId);
  const letztes = [...m.spiele].reverse().find(hatErgebnis);
  const form = formKurve(m);
  const teamUrl = `${appUrl()}/verein/${verein.slug}/${m.slug}`;
  const jsonLd = mannschaftJsonLd({
    vereinsName: verein.name,
    vereinsUrl: `${appUrl()}/verein/${verein.slug}`,
    name: m.name,
    liga: m.ligaName || null,
    url: teamUrl,
    anstehend: m.spiele.filter((s) => istAnstehend(s, new Date())).map((s) => ({ ...s, url: `${teamUrl}/spielplan` })),
  });

  return (
    <div className="space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }} />
      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">Nächstes Spiel</h2>
        {m.naechstesSpiel ? (
          <SpielKarte spiel={m.naechstesSpiel} eigenTeamtable={m.teamtableId} />
        ) : (
          <p className="text-sm text-muted-foreground">Aktuell ist kein Spiel angesetzt.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-heading text-lg font-semibold">Letztes Ergebnis</h2>
        {letztes ? (
          <SpielKarte spiel={letztes} eigenTeamtable={m.teamtableId} />
        ) : (
          <p className="text-sm text-muted-foreground">Noch kein Spiel gespielt.</p>
        )}
      </section>

      {zeile && (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">Tabellenposition</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Platz", String(zeile.rang)],
              ["Punkte", `${zeile.punktePlus ?? 0}:${zeile.punkteMinus ?? 0}`],
              ["Tore", `${zeile.torePlus ?? 0}:${zeile.toreMinus ?? 0}`],
            ].map(([label, wert]) => (
              <div key={label} className="rounded-xl bg-background p-3 ring-1 ring-foreground/[0.06]">
                <p className="font-heading text-xl font-bold tabular-nums">{wert}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {zeile.spiele ?? 0} Spiele · {zeile.siege ?? 0} S · {zeile.unentschieden ?? 0} U ·{" "}
            {zeile.niederlagen ?? 0} N
          </p>
        </section>
      )}

      {form.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">Form</h2>
          <FormChips form={form} />
        </section>
      )}

      <StandHinweis stand={verein.spieleSynchronisiertAm} />
    </div>
  );
}
