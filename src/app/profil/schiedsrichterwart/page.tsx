import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import {
  holeSchiedsrichterEinsatzZahlen,
  istSchiedsrichterwart,
} from "@/lib/schiedsrichterwart";
import { holeTermineMitZuordnungen } from "@/lib/zuordnung";
import { berechneBesetzung } from "@/lib/besetzung";
import { schiedsrichterKuerzelPasstZu } from "@/lib/rundenspiel-import";
import {
  schiedsrichterOhneLoginZuordnen,
  schiedsrichterZuordnen,
  schiedsrichterZuordnungEntfernen,
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
import { Input } from "@/components/ui/input";
import { LabeledSelect } from "@/components/labeled-select";
import { cn } from "@/lib/utils";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { rundenspielTypLabel } from "@/lib/termin-label";

// Einheitlicher Button-Look für <summary>-Aufklapptoggles (Ersetzen/Weiteren
// hinzufügen/Schließen) — echte <Button>-Komponenten können hier nicht
// stehen (die native Aufklapp-Mechanik braucht ein <summary>-Element),
// aber dieselbe buttonVariants-Funktion liefert exakt dieselben Klassen wie
// überall sonst, statt einem eigenen Ad-hoc-Textlink-Stil.
const DISCLOSURE_KLASSE = cn(
  buttonVariants({ variant: "outline", size: "xs" }),
  "cursor-pointer list-none [&::-webkit-details-marker]:hidden"
);

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Nur diese Typen: der Verein ordnet hier selbst einen Schiedsrichter zu.
// spiel_ics (persönliche ICS-Feed-Einsätze) und echte Ligaspiele
// (rundenspiel mit pflichtspiel = true, Schiri kommt vom Verband) bleiben
// bewusst außen vor — siehe Kommentar in besetzung.ts.
function brauchtSchiedsrichterVomVerein(termin: {
  typ: string;
  pflichtspiel: boolean | null;
}): boolean {
  if (termin.typ === "rundenspiel") return termin.pflichtspiel !== true;
  return termin.typ === "testspiel" || termin.typ === "turnier_spiel";
}

export default async function SchiedsrichterwartPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  if (!(await istSchiedsrichterwart(vereinId, userId))) {
    notFound();
  }

  const { filter } = await searchParams;
  const nurOffene = filter === "offen";

  const [schiedsrichterListeRoh, termineMitZuordnungen] = await Promise.all([
    holeSchiedsrichterEinsatzZahlen(vereinId),
    holeTermineMitZuordnungen(vereinId),
  ]);
  // Aufsteigend nach Einsätzen — wer am wenigsten gepfiffen hat, steht oben.
  // Für die faire Verteilung (die eigentliche Aufgabe des Warts) ist das die
  // naheliegendere Reihenfolge als alphabetisch nach Name.
  const schiedsrichterListe = [...schiedsrichterListeRoh].sort(
    (a, b) => a.anzahlEinsaetze - b.anzahlEinsaetze
  );

  // Wer ist an einem bestimmten Zeitpunkt schon anderweitig als
  // Schiedsrichter gebunden (an einem ANDEREN Termin zur exakt gleichen
  // Uhrzeit) — Basis für "wer wäre noch frei", falls eine Umbesetzung
  // gewünscht ist. Über ALLE geladenen Termine berechnet (nicht nur die
  // relevanten unten), da auch ein ICS-Spiel oder ein Turnierspiel zur
  // selben Zeit eine echte Doppelbelegung wäre.
  const belegtProZeitpunktUndTermin = new Map<number, Map<string, string>>();
  for (const termin of termineMitZuordnungen) {
    const zeitpunkt = termin.start.getTime();
    const map = belegtProZeitpunktUndTermin.get(zeitpunkt) ?? new Map();
    for (const z of termin.zuordnungen) {
      if (z.funktionstraegerTyp === "schiedsrichter" && z.userId) {
        map.set(z.userId, termin.id);
      }
    }
    if (termin.icsSchiedsrichter) {
      map.set(termin.icsSchiedsrichter.id, termin.id);
    }
    belegtProZeitpunktUndTermin.set(zeitpunkt, map);
  }

  // Bewusst ALLE relevanten Termine, nicht nur unbesetzte — sonst ließe sich
  // eine bereits erfolgte (ggf. falsche) Zuordnung über diese Seite nicht
  // mehr korrigieren, sobald der Schiedsrichter-Bedarf erfüllt ist. Der
  // "Nur offene"-Filter unten blendet sie bei Bedarf trotzdem aus (z.B. bei
  // vielen Rundenspielen über die Saison, um nicht durch bereits erledigte
  // Termine scrollen zu müssen).
  const alleRelevantenTermine = termineMitZuordnungen
    .filter(brauchtSchiedsrichterVomVerein)
    .map((termin) => {
      const belegteAmZeitpunkt =
        belegtProZeitpunktUndTermin.get(termin.start.getTime()) ?? new Map();
      const freiePersonen = schiedsrichterListe.filter((s) => {
        const belegtBeiTerminId = belegteAmZeitpunkt.get(s.userId);
        return !belegtBeiTerminId || belegtBeiTerminId === termin.id;
      });
      // Wer fehlt in freiePersonen, weil zu genau diesem Zeitpunkt bereits
      // ein ANDERER Termin zugeordnet ist — Grundlage für den Hinweis unten,
      // warum eine erwartete Person in der Auswahl nicht auftaucht.
      const belegtAnderweitig = schiedsrichterListe.filter(
        (s) => !freiePersonen.some((f) => f.userId === s.userId)
      );
      return {
        ...termin,
        besetzung: berechneBesetzung(termin.zuordnungen),
        freiePersonen,
        belegtAnderweitig,
      };
    })
    .sort(
      (a, b) => Number(a.besetzung.schiriErfuellt) - Number(b.besetzung.schiriErfuellt)
    );
  const offeneAnzahl = alleRelevantenTermine.filter(
    (t) => !t.besetzung.schiriErfuellt
  ).length;
  const relevanteTermine = nurOffene
    ? alleRelevantenTermine.filter((t) => !t.besetzung.schiriErfuellt)
    : alleRelevantenTermine;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <h1 className="font-heading text-2xl font-semibold">Schiedsrichterwart</h1>
        <p className="text-sm text-muted-foreground">
          Übersicht über alle Schiedsrichter im Verein und ihre Einsätze,
          sowie Termine mit Schiedsrichter-Bedarf — insbesondere
          Freundschaftsspiele/Turniere und Rundenspiele ohne Verbands-Schiri.
          Bereits zugeordnete Schiedsrichter lassen sich hier auch entfernen
          oder ersetzen (Umbesetzung).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schiedsrichter im Verein</CardTitle>
          <CardDescription>
            Anzahl bereits absolvierter Einsätze (ICS-Feed sowie selbst
            zugeordnete Freundschaftsspiele/Turniere/Rundenspiele), aufsteigend
            sortiert — wer oben steht, hat am wenigsten gepfiffen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schiedsrichterListe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine aktiven Schiedsrichter im Verein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead className="text-right">Einsätze gepfiffen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schiedsrichterListe.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell className="font-medium">
                      {s.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.email}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.anzahlEinsaetze === 0 ? (
                        <Badge variant="warning">noch keiner</Badge>
                      ) : (
                        s.anzahlEinsaetze
                      )}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Termine ({offeneAnzahl} offen von {alleRelevantenTermine.length})
            </CardTitle>
            <Link
              href={nurOffene ? "/profil/schiedsrichterwart" : "?filter=offen"}
              className="text-xs text-muted-foreground underline"
            >
              {nurOffene ? "Alle anzeigen" : "Nur offene anzeigen"}
            </Link>
          </div>
          <CardDescription>
            Freundschaftsspiele, Turnierspiele und Rundenspiele ohne
            Verbands-Schiri. Die Auswahl zeigt nur Schiedsrichter, die zu
            diesem Zeitpunkt nicht bereits an einem anderen Termin eingeteilt
            sind.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {relevanteTermine.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {nurOffene
                ? "Keine offenen Termine — alles besetzt."
                : "Keine anstehenden Termine mit Schiedsrichter-Bedarf."}
            </p>
          ) : (
            relevanteTermine.map((t) => {
              const typLabel =
                t.typ === "rundenspiel"
                  ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                  : (TYP_LABEL[t.typ] ?? t.typ);
              const bestehendeSchiedsrichter = t.zuordnungen.filter(
                (z) => z.funktionstraegerTyp === "schiedsrichter"
              );
              const personOptionen = t.freiePersonen
                .filter(
                  (s) => !bestehendeSchiedsrichter.some((z) => z.userId === s.userId)
                )
                .map((s) => ({ value: s.userId, label: s.name ?? s.email }));

              return (
                <div key={t.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {formatDateTime(t.start)}
                    </span>
                    <Badge variant="outline">{typLabel}</Badge>
                    <Badge
                      variant={t.besetzung.schiriErfuellt ? "secondary" : "outline"}
                    >
                      {t.besetzung.schiriErfuellt
                        ? "Schiedsrichter zugeordnet"
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
                  {t.nuligaSchiedsrichterKuerzel && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      nuLiga-Ansetzung: {t.nuligaSchiedsrichterKuerzel}
                    </p>
                  )}
                  {bestehendeSchiedsrichter.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {bestehendeSchiedsrichter.map((z) => {
                        const kuerzel = t.nuligaSchiedsrichterKuerzel;
                        const passt =
                          kuerzel != null
                            ? schiedsrichterKuerzelPasstZu(kuerzel, z.name)
                            : null;
                        return (
                        <li key={z.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              Schiedsrichter:{" "}
                              {z.name ?? z.externerName ?? z.email}
                              {z.externerName && !z.email
                                ? " (ohne Login)"
                                : ""}
                              {passt === true && (
                                <Badge variant="secondary" className="ml-2">
                                  ✓ passt zu nuLiga ({kuerzel})
                                </Badge>
                              )}
                              {passt === false && (
                                <Badge variant="warning" className="ml-2">
                                  ⚠ nuLiga nennt {kuerzel}
                                </Badge>
                              )}
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
                                  {/* Ersatz für GENAU diese Person — nur
                                      diese eine Zuordnung wird beim Absenden
                                      entfernt, nicht alle bestehenden (siehe
                                      ersetzeZuordnungId in actions.ts). */}
                                  <form
                                    action={schiedsrichterZuordnen}
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
                                    <div className="min-w-48">
                                      <LabeledSelect
                                        name="userId"
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
                              <form action={schiedsrichterZuordnungEntfernen}>
                                <input
                                  type="hidden"
                                  name="zuordnungId"
                                  value={z.id}
                                />
                                <ConfirmSubmitButton
                                  confirmText={`${z.name ?? z.externerName ?? z.email} als Schiedsrichter entfernen?`}
                                  variant="destructive"
                                  size="xs"
                                >
                                  Entfernen
                                </ConfirmSubmitButton>
                              </form>
                            </div>
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                  {!t.besetzung.schiriVoll && (
                    <div className="mt-2 flex flex-col gap-2">
                      {personOptionen.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Kein Schiedsrichter zu diesem Zeitpunkt verfügbar.
                        </p>
                      )}
                      {personOptionen.length > 0 &&
                        (bestehendeSchiedsrichter.length === 0 ? (
                          // Noch niemand zugeordnet: das ist die einzige
                          // Aktion für diesen Termin, deshalb direkt sichtbar
                          // statt hinter einem Toggle versteckt.
                          <form
                            action={schiedsrichterZuordnen}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="terminId" value={t.id} />
                            <div className="min-w-48">
                              <LabeledSelect
                                name="userId"
                                placeholder="Schiedsrichter wählen…"
                                options={personOptionen}
                                required
                              />
                            </div>
                            <Button type="submit" size="sm">
                              Zuordnen
                            </Button>
                          </form>
                        ) : (
                          <details className="group">
                            <summary className={DISCLOSURE_KLASSE}>
                              <span className="group-open:hidden">
                                Weiteren Schiedsrichter hinzufügen
                              </span>
                              <span className="hidden group-open:inline">
                                Schließen
                              </span>
                            </summary>
                            <form
                              action={schiedsrichterZuordnen}
                              className="mt-2 flex flex-wrap items-center gap-2"
                            >
                              <input type="hidden" name="terminId" value={t.id} />
                              <div className="min-w-48">
                                <LabeledSelect
                                  name="userId"
                                  placeholder="Schiedsrichter wählen…"
                                  options={personOptionen}
                                  required
                                />
                              </div>
                              <Button type="submit" size="sm">
                                Weiteren zuordnen
                              </Button>
                            </form>
                          </details>
                        ))}
                      {/* Ohne Login immer anbieten, unabhängig von
                          personOptionen — gerade wenn niemand Bekanntes
                          verfügbar ist (Gast-Schiri), ist das die einzige
                          Möglichkeit. Kein eigener Account, daher auch keine
                          Benachrichtigungs-Mail (siehe actions.ts). */}
                      <form
                        action={schiedsrichterOhneLoginZuordnen}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="terminId" value={t.id} />
                        <Input
                          name="name"
                          placeholder="Name ohne Login (z.B. Gast-Schiri)"
                          required
                          className="h-8 w-56"
                        />
                        <Button type="submit" size="xs" variant="ghost">
                          Ohne Login zuordnen
                        </Button>
                      </form>
                      {t.belegtAnderweitig.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nicht in der Auswahl, da zu dieser Zeit bereits
                          anderweitig eingeteilt:{" "}
                          {t.belegtAnderweitig
                            .map((s) => s.name ?? s.email)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
