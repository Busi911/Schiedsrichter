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
  zeitnehmerOhneLoginZuordnen,
  zeitnehmerSelbstanmeldungDeaktivieren,
  zeitnehmerSelbstanmeldungLinkErneuern,
  zeitnehmerVorschlagBestaetigen,
  zeitnehmerZuordnen,
  zeitnehmerZuordnungEntfernen,
} from "./actions";
import { appUrl } from "@/lib/app-url";
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

const ROLLE_OPTIONEN = [
  { value: "zeitnehmer", label: "Zeitnehmer" },
  { value: "sekretaer", label: "Sekretär" },
];

// Deckungsgleich mit ZEITNEHMER_RELEVANTE_TYPEN in dashboard.ts — anders als
// beim Schiedsrichter braucht hier auch spiel_ics (persönlicher ICS-Einsatz)
// einen Zeitnehmer/Sekretär vom eigenen Verein.
const ZEITNEHMER_RELEVANTE_TYPEN = [
  "spiel_ics",
  "testspiel",
  "turnier_spiel",
  "rundenspiel",
];

export default async function ZeitnehmerwartPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  if (!(await istZeitnehmerwart(vereinId, userId))) {
    notFound();
  }

  const { filter } = await searchParams;
  const nurOffene = filter === "offen";

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

  // Bewusst ALLE relevanten Termine, nicht nur unbesetzte — sonst ließe sich
  // eine bereits erfolgte Zuordnung über diese Seite nicht mehr korrigieren
  // (siehe gleiches Prinzip in schiedsrichterwart/page.tsx). Der
  // "Nur offene"-Filter unten blendet sie bei Bedarf trotzdem aus.
  const alleRelevantenTermine = termineMitZuordnungen
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
  const offeneAnzahl = alleRelevantenTermine.filter(
    (t) => !t.besetzung.zeitnehmerSekretaerErfuellt
  ).length;
  const relevanteTermine = nurOffene
    ? alleRelevantenTermine.filter((t) => !t.besetzung.zeitnehmerSekretaerErfuellt)
    : alleRelevantenTermine;

  // Über die öffentliche Selbsteintragung erfasste Personen, die noch
  // keiner echten Person zugeordnet wurden (siehe
  // zeitnehmerSelbstEintragenOeffentlich in
  // zeitnehmer-eintragen/[token]/actions.ts) — zur Bestätigung/Korrektur
  // durch den Wart (siehe zeitnehmerVorschlagBestaetigen).
  const unbestaetigteSelbsteintragungen = termineMitZuordnungen.flatMap((t) =>
    t.zuordnungen
      .filter((z) => z.quelle === "selbst_eingetragen_oeffentlich" && !z.userId)
      .map((z) => ({ ...z, termin: t }))
  );

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
          <CardTitle className="text-base">Öffentliche Selbsteintragung</CardTitle>
          <CardDescription>
            Login-freier Link, über den sich Personen (z.B. Eltern eines
            Kaders) selbst als Zeitnehmer/Sekretär eintragen können —
            gefiltert nach Mannschaft. Namen werden dabei automatisch mit
            bereits angelegten Funktionsträgern abgeglichen; bei Unsicherheit
            landet der Eintrag unten zur Bestätigung.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {verein?.zeitnehmerSelbstanmeldungToken ? (
            <p className="break-all rounded-lg border bg-muted/40 p-3 text-sm">
              {appUrl()}/zeitnehmer-eintragen/
              {verein.zeitnehmerSelbstanmeldungToken}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch nicht aktiviert.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={zeitnehmerSelbstanmeldungLinkErneuern}>
              <Button type="submit" variant="outline" size="sm">
                {verein?.zeitnehmerSelbstanmeldungToken
                  ? "Link neu generieren (alter Link wird ungültig)"
                  : "Aktivieren"}
              </Button>
            </form>
            {verein?.zeitnehmerSelbstanmeldungToken && (
              <form action={zeitnehmerSelbstanmeldungDeaktivieren}>
                <ConfirmSubmitButton
                  confirmText="Selbsteintragung deaktivieren? Der bisherige Link funktioniert danach nicht mehr."
                  variant="ghost"
                  size="sm"
                >
                  Deaktivieren
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      {unbestaetigteSelbsteintragungen.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Selbsteintragungen zum Bestätigen (
              {unbestaetigteSelbsteintragungen.length})
            </CardTitle>
            <CardDescription>
              Über die öffentliche Selbsteintragung erfasst, noch keiner
              angelegten Person zugeordnet. Vorausgewählt ist der beste
              automatische Namens-Vorschlag, falls vorhanden — bei Bedarf
              vor dem Bestätigen korrigieren.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {unbestaetigteSelbsteintragungen.map((z) => {
              const kandidaten = zeitnehmerListe
                .filter((s) => s.rollen.includes(z.funktionstraegerTyp as (typeof ZEITNEHMER_ROLLEN)[number]))
                .map((s) => ({ value: s.userId, label: s.name ?? s.email }));
              return (
                <div key={z.id} className="rounded-lg border p-3 text-sm">
                  <p>
                    <span className="font-medium">{z.externerName}</span> als{" "}
                    {z.funktionstraegerTyp === "zeitnehmer"
                      ? "Zeitnehmer"
                      : "Sekretär"}{" "}
                    · {formatDateTime(z.termin.start)}
                    {z.termin.beschreibung ? ` · ${z.termin.beschreibung}` : ""}
                  </p>
                  {kandidaten.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Keine passende Person im Verein angelegt.
                    </p>
                  ) : (
                    <form
                      action={zeitnehmerVorschlagBestaetigen}
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="zuordnungId" value={z.id} />
                      <div className="min-w-56">
                        <LabeledSelect
                          name="userId"
                          placeholder="Person wählen…"
                          defaultValue={z.matchVorschlagUserId ?? undefined}
                          options={kandidaten}
                          required
                        />
                      </div>
                      <Button type="submit" size="sm">
                        Bestätigen
                      </Button>
                    </form>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Termine ({offeneAnzahl} offen von {alleRelevantenTermine.length})
            </CardTitle>
            <Link
              href={nurOffene ? "/profil/zeitnehmerwart" : "?filter=offen"}
              className="text-xs text-muted-foreground underline"
            >
              {nurOffene ? "Alle anzeigen" : "Nur offene anzeigen"}
            </Link>
          </div>
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
                  {!t.besetzung.zeitnehmerSekretaerVoll && (
                    <div className="mt-2 flex flex-col gap-2">
                      {personOptionen.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Keine Person zu diesem Zeitpunkt verfügbar.
                        </p>
                      )}
                      {personOptionen.length > 0 &&
                        (bestehende.length === 0 ? (
                          <form
                            action={zeitnehmerZuordnen}
                            className="flex flex-wrap items-center gap-2"
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
                          <details className="group">
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
                              <input
                                type="hidden"
                                name="terminId"
                                value={t.id}
                              />
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
                      {/* Ohne Login immer anbieten, unabhängig von
                          personOptionen — siehe Pendant in
                          schiedsrichterwart/page.tsx. Standardmäßig
                          eingeklappt: nur ein Fallback. */}
                      <details className="group">
                        <summary className={DISCLOSURE_KLASSE}>
                          <span className="group-open:hidden">
                            Ohne Login zuordnen (Fallback)
                          </span>
                          <span className="hidden group-open:inline">
                            Schließen
                          </span>
                        </summary>
                        <form
                          action={zeitnehmerOhneLoginZuordnen}
                          className="mt-2 flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="terminId" value={t.id} />
                          <Input
                            name="name"
                            placeholder="Name ohne Login (z.B. Gast-Zeitnehmer)"
                            required
                            className="h-8 min-w-56 flex-1"
                          />
                          <div className="w-36">
                            <LabeledSelect
                              name="rolle"
                              placeholder="Rolle…"
                              options={ROLLE_OPTIONEN}
                              required
                            />
                          </div>
                          <Button type="submit" size="xs" variant="ghost">
                            Zuordnen
                          </Button>
                        </form>
                      </details>
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
