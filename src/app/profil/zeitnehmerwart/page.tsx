import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import {
  holeZeitnehmerEinsatzZahlen,
  istZeitnehmerwart,
} from "@/lib/zeitnehmerwart";
import { holeTermineMitZuordnungen } from "@/lib/zuordnung";
import { berechneBesetzung } from "@/lib/besetzung";
import { bedarfFuer } from "@/lib/dienste";
import {
  zeitnehmerZuordnen,
  zeitnehmerZuordnungEntfernen,
} from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { LabeledSelect } from "@/components/labeled-select";
import { cn } from "@/lib/utils";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { rundenspielTypLabel } from "@/lib/termin-label";

// Siehe DISCLOSURE_KLASSE in profil/schiedsrichterwart/page.tsx — gleicher
// Button-Look für <summary>-Aufklapptoggles, hier dupliziert statt aus einer
// gemeinsamen Datei importiert, weil beide Seiten sonst keine Berührung
// hätten (bewusst eng begrenzte, getrennte Wart-Seiten, siehe actions.ts).
const DISCLOSURE_KLASSE = cn(
  buttonVariants({ variant: "outline", size: "xs" }),
  "cursor-pointer list-none [&::-webkit-details-marker]:hidden"
);

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;

// Deckungsgleich mit ZEITNEHMER_RELEVANTE_TYPEN in dashboard.ts — anders als
// beim Schiedsrichter braucht hier auch spiel_ics (persönlicher ICS-Einsatz)
// einen Zeitnehmer/Sekretär vom eigenen Verein.
const ZEITNEHMER_RELEVANTE_TYPEN = [
  "spiel_ics",
  "testspiel",
  "turnier_spiel",
  "rundenspiel",
];

export default async function ZeitnehmerwartPage() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  if (!(await istZeitnehmerwart(vereinId, userId))) {
    notFound();
  }

  const [zeitnehmerListe, termineMitZuordnungen, verein] = await Promise.all([
    holeZeitnehmerEinsatzZahlen(vereinId),
    holeTermineMitZuordnungen(vereinId),
    withTenant(vereinId, (tx) =>
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
    ),
  ]);

  // Wer ist an einem bestimmten Zeitpunkt schon anderweitig als Zeitnehmer
  // ODER Sekretär gebunden — Basis für "wer wäre noch frei" bei einer
  // Umbesetzung.
  const belegtProZeitpunktUndTermin = new Map<number, Map<string, string>>();
  for (const termin of termineMitZuordnungen) {
    const zeitpunkt = termin.start.getTime();
    const map = belegtProZeitpunktUndTermin.get(zeitpunkt) ?? new Map();
    for (const z of termin.zuordnungen) {
      if (
        (ZEITNEHMER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp) &&
        z.userId
      ) {
        map.set(z.userId, termin.id);
      }
    }
    belegtProZeitpunktUndTermin.set(zeitpunkt, map);
  }

  const relevanteTermine = termineMitZuordnungen
    .filter((t) => ZEITNEHMER_RELEVANTE_TYPEN.includes(t.typ))
    .map((termin) => {
      const belegteAmZeitpunkt =
        belegtProZeitpunktUndTermin.get(termin.start.getTime()) ?? new Map();
      const freiePersonen = zeitnehmerListe.filter((s) => {
        const belegtBeiTerminId = belegteAmZeitpunkt.get(s.userId);
        return !belegtBeiTerminId || belegtBeiTerminId === termin.id;
      });
      const zeitnehmerBedarf = verein
        ? bedarfFuer(
            verein,
            termin.typ,
            "zeitnehmer",
            termin.pflichtspiel,
            termin.freundschaftsTyp
          )
        : 1;
      return {
        ...termin,
        besetzung: berechneBesetzung(
          termin.zuordnungen,
          false,
          zeitnehmerBedarf,
          verein?.zeitnehmerSekretaerMax
        ),
        freiePersonen,
      };
    })
    .sort(
      (a, b) =>
        Number(a.besetzung.zeitnehmerSekretaerErfuellt) -
        Number(b.besetzung.zeitnehmerSekretaerErfuellt)
    );
  const offeneAnzahl = relevanteTermine.filter(
    (t) => !t.besetzung.zeitnehmerSekretaerErfuellt
  ).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <h1 className="font-heading text-2xl font-semibold">
          Zeitnehmer-/Sekretärwart
        </h1>
        <p className="text-sm text-muted-foreground">
          Übersicht über alle Zeitnehmer/Sekretäre im Verein und ihre
          Einsätze, sowie Termine mit Zeitnehmer-/Sekretär-Bedarf. Bereits
          zugeordnete Personen lassen sich hier auch entfernen oder ersetzen
          (Umbesetzung).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Zeitnehmer/Sekretäre im Verein
          </CardTitle>
          <CardDescription>
            Anzahl bereits absolvierter Einsätze (in beiden Rollen
            zusammen).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {zeitnehmerListe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine aktiven Zeitnehmer/Sekretäre im Verein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead className="text-right">Einsätze</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeitnehmerListe.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell className="font-medium">
                      {s.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.email}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.anzahlEinsaetze}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Termine ({offeneAnzahl} offen von {relevanteTermine.length})
          </CardTitle>
          <CardDescription>
            ICS-Spiele, Freundschaftsspiele, Turnierspiele und Rundenspiele.
            Die Auswahl zeigt nur Personen, die zu diesem Zeitpunkt nicht
            bereits an einem anderen Termin eingeteilt sind.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {relevanteTermine.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine anstehenden Termine mit Zeitnehmer-/Sekretär-Bedarf.
            </p>
          ) : (
            relevanteTermine.map((t) => {
              const typLabel =
                t.typ === "rundenspiel"
                  ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                  : (TYP_LABEL[t.typ] ?? t.typ);
              const bestehende = t.zuordnungen.filter((z) =>
                (ZEITNEHMER_ROLLEN as readonly string[]).includes(
                  z.funktionstraegerTyp
                )
              );
              const personOptionen = t.freiePersonen.flatMap((s) =>
                s.rollen
                  .filter(
                    (rolle) =>
                      !bestehende.some(
                        (z) => z.userId === s.userId && z.funktionstraegerTyp === rolle
                      )
                  )
                  .map((rolle) => ({
                    value: `${s.userId}|${rolle}`,
                    label: `${s.name ?? s.email} (${rolle === "zeitnehmer" ? "Zeitnehmer" : "Sekretär"})`,
                  }))
              );

              return (
                <div key={t.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {formatDateTime(t.start)}
                    </span>
                    <Badge variant="outline">{typLabel}</Badge>
                    <Badge
                      variant={
                        t.besetzung.zeitnehmerSekretaerErfuellt
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {t.besetzung.zeitnehmerSekretaerErfuellt
                        ? "Besetzung vollständig"
                        : "Besetzung offen"}
                    </Badge>
                    {t.ort && (
                      <span className="text-muted-foreground">{t.ort}</span>
                    )}
                  </div>
                  {t.beschreibung && (
                    <p className="mt-1 text-muted-foreground">
                      {t.beschreibung}
                    </p>
                  )}
                  {bestehende.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {bestehende.map((z) => (
                        <li key={z.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              {z.funktionstraegerTyp === "zeitnehmer"
                                ? "Zeitnehmer"
                                : "Sekretär"}
                              : {z.name ?? z.externerName ?? z.email}
                              {z.externerName && !z.email
                                ? " (ohne Login)"
                                : ""}
                            </span>
                            <div className="flex items-center gap-3">
                              {personOptionen.length > 0 && (
                                <details className="group">
                                  <summary className={DISCLOSURE_KLASSE}>
                                    <span className="group-open:hidden">
                                      Ersetzen
                                    </span>
                                    <span className="hidden group-open:inline">
                                      Schließen
                                    </span>
                                  </summary>
                                  <form
                                    action={zeitnehmerZuordnen}
                                    className="mt-2 flex flex-wrap items-center gap-2"
                                  >
                                    <input
                                      type="hidden"
                                      name="terminId"
                                      value={t.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="ersetzeZuordnungId"
                                      value={z.id}
                                    />
                                    <div className="min-w-56">
                                      <LabeledSelect
                                        name="personRolle"
                                        placeholder="Ersatz wählen…"
                                        options={personOptionen}
                                        required
                                      />
                                    </div>
                                    <Button type="submit" size="xs" variant="outline">
                                      Ersetzen
                                    </Button>
                                  </form>
                                </details>
                              )}
                              <form action={zeitnehmerZuordnungEntfernen}>
                                <input
                                  type="hidden"
                                  name="zuordnungId"
                                  value={z.id}
                                />
                                <ConfirmSubmitButton
                                  confirmText={`${z.name ?? z.externerName ?? z.email} entfernen?`}
                                  variant="destructive"
                                  size="xs"
                                >
                                  Entfernen
                                </ConfirmSubmitButton>
                              </form>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!t.besetzung.zeitnehmerSekretaerVoll &&
                    (personOptionen.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Keine Person zu diesem Zeitpunkt verfügbar.
                      </p>
                    ) : bestehende.length === 0 ? (
                      <form
                        action={zeitnehmerZuordnen}
                        className="mt-2 flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="terminId" value={t.id} />
                        <div className="min-w-56">
                          <LabeledSelect
                            name="personRolle"
                            placeholder="Person wählen…"
                            options={personOptionen}
                            required
                          />
                        </div>
                        <Button type="submit" size="sm">
                          Zuordnen
                        </Button>
                      </form>
                    ) : (
                      <details className="group mt-2">
                        <summary className={DISCLOSURE_KLASSE}>
                          <span className="group-open:hidden">
                            Weitere Person hinzufügen
                          </span>
                          <span className="hidden group-open:inline">
                            Schließen
                          </span>
                        </summary>
                        <form
                          action={zeitnehmerZuordnen}
                          className="mt-2 flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="terminId" value={t.id} />
                          <div className="min-w-56">
                            <LabeledSelect
                              name="personRolle"
                              placeholder="Person wählen…"
                              options={personOptionen}
                              required
                            />
                          </div>
                          <Button type="submit" size="sm">
                            Weitere zuordnen
                          </Button>
                        </form>
                      </details>
                    ))}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
