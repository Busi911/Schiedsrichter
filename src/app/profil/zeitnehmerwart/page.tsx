import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, vereine } from "@/db/schema";
import {
  holeInaktiveZeitnehmerKandidaten,
  holeZeitnehmerEinsatzZahlen,
  istZeitnehmerwart,
} from "@/lib/zeitnehmerwart";
import { holeTermineMitZuordnungen } from "@/lib/zuordnung";
import { berechneBesetzung } from "@/lib/besetzung";
import { bedarfFuer } from "@/lib/dienste";
import { angesetzteNamenPassenZu } from "@/lib/rundenspiel-import";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import {
  zeitnehmerBedarfUeberschreiben,
  zeitnehmerInaktiveRolleAktivierenUndZuordnen,
  zeitnehmerNeuAnlegenUndBestaetigen,
  zeitnehmerOhneLoginZuordnen,
  zeitnehmerSelbstanmeldungDeaktivieren,
  zeitnehmerSelbstanmeldungLinkErneuern,
  zeitnehmerVorschlagBestaetigen,
  zeitnehmerZuordnen,
  zeitnehmerZuordnungEntfernen,
} from "./actions";
import { appUrl } from "@/lib/app-url";
import { LinkSpinner } from "@/components/link-spinner";
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
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { PersonSelect } from "@/components/person-select";
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
  searchParams: Promise<{ filter?: string; mannschaft?: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  if (!(await istZeitnehmerwart(vereinId, userId))) {
    notFound();
  }

  const { filter, mannschaft: mannschaftFilter } = await searchParams;
  const nurOffene = filter === "offen";

  const [
    zeitnehmerListe,
    inaktiveKandidaten,
    termineMitZuordnungen,
    verein,
    alleMannschaften,
  ] = await Promise.all([
    holeZeitnehmerEinsatzZahlen(vereinId),
    holeInaktiveZeitnehmerKandidaten(vereinId),
    holeTermineMitZuordnungen(vereinId),
    withTenant(vereinId, (tx) =>
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
    ),
    withTenant(vereinId, (tx) =>
      tx.query.mannschaften.findMany({ where: eq(mannschaften.vereinId, vereinId) })
    ),
  ]);
  const mannschaftenSortiert = sortiereMannschaften(alleMannschaften);

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

  // Welche Rolle(n) einer bereits (mit mindestens einer aktiven Rolle)
  // sichtbaren Person zusätzlich deaktiviert sind — Basis dafür, eine
  // deaktivierte Rolle in der Zuordnen-Auswahl ausgegraut MIT anzuzeigen
  // statt sie kommentarlos verschwinden zu lassen (z.B. Jan ist aktiver
  // Sekretär, aber seine Zeitnehmer-Rolle wurde deaktiviert — "Jan Perkitny
  // (Zeitnehmer)" taucht dann ausgegraut auf statt gar nicht).
  const inaktiveRollenProPerson = new Map<
    string,
    Set<(typeof ZEITNEHMER_ROLLEN)[number]>
  >();
  for (const k of inaktiveKandidaten) {
    const rollen = inaktiveRollenProPerson.get(k.userId) ?? new Set();
    rollen.add(k.typ);
    inaktiveRollenProPerson.set(k.userId, rollen);
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
            termin.freundschaftsTyp,
            termin.zeitnehmerBedarfOverride
          )
        : 1;
      return {
        ...termin,
        zeitnehmerBedarf,
        besetzung: berechneBesetzung(termin.zuordnungen, false, zeitnehmerBedarf),
        freiePersonen,
      };
    })
    .sort(
      (a, b) =>
        Number(a.besetzung.zeitnehmerSekretaerErfuellt) -
        Number(b.besetzung.zeitnehmerSekretaerErfuellt)
    );
  // Nur Mannschaften als Filter anbieten, die auch mindestens einen
  // relevanten Termin haben — sonst führte ein Klick nur zu "Keine
  // anstehenden Termine" (gleiches Prinzip wie in
  // zeitnehmer-eintragen/[token]/page.tsx).
  const mannschaftenMitTerminen = new Set(
    alleRelevantenTermine
      .map((t) => t.mannschaftId)
      .filter((id): id is string => !!id)
  );
  const anzeigbareMannschaften = mannschaftenSortiert.filter((m) =>
    mannschaftenMitTerminen.has(m.id)
  );

  const terminePerMannschaft = mannschaftFilter
    ? alleRelevantenTermine.filter((t) => t.mannschaftId === mannschaftFilter)
    : alleRelevantenTermine;
  const offeneAnzahl = terminePerMannschaft.filter(
    (t) => !t.besetzung.zeitnehmerSekretaerErfuellt
  ).length;
  const relevanteTermine = nurOffene
    ? terminePerMannschaft.filter((t) => !t.besetzung.zeitnehmerSekretaerErfuellt)
    : terminePerMannschaft;

  // Baut die Termine-Filter-URL unter Beibehaltung des jeweils anderen,
  // unabhängigen Filters (offen/Mannschaft lassen sich kombinieren).
  function terminFilterHref(overrides: {
    nurOffene?: boolean;
    mannschaftId?: string | null;
  }) {
    const naechsteOffen = overrides.nurOffene ?? nurOffene;
    const naechsteMannschaft =
      overrides.mannschaftId !== undefined ? overrides.mannschaftId : mannschaftFilter;
    const params = new URLSearchParams();
    if (naechsteOffen) params.set("filter", "offen");
    if (naechsteMannschaft) params.set("mannschaft", naechsteMannschaft);
    const qs = params.toString();
    return qs ? `?${qs}` : "/profil/zeitnehmerwart";
  }

  // Über die öffentliche Selbsteintragung erfasste Personen, die noch
  // keiner echten Person zugeordnet wurden (siehe
  // zeitnehmerSelbstEintragenOeffentlich in
  // zeitnehmer-eintragen/[token]/actions.ts) — zur Bestätigung/Korrektur
  // durch den Wart (siehe zeitnehmerVorschlagBestaetigen). Explizit auf
  // ZEITNEHMER_ROLLEN gefiltert, da "selbst_eingetragen_oeffentlich" seit
  // /ordner-eintragen dieselbe quelle auch für Ordner/Kioskdienst-
  // Zuordnungen ist — ohne den Filter tauchten die hier fälschlich mit auf.
  const unbestaetigteSelbsteintragungen = termineMitZuordnungen.flatMap((t) =>
    t.zuordnungen
      .filter(
        (z) =>
          z.quelle === "selbst_eingetragen_oeffentlich" &&
          !z.userId &&
          (ZEITNEHMER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp)
      )
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
              // Kein aktiver automatischer Vorschlag (matchVorschlagUserId)
              // gefunden — häufig, weil die Person zwar schon einmal
              // angelegt, inzwischen aber deaktiviert wurde (z.B.
              // Saisonwechsel). In dem Fall zusätzlich gegen deaktivierte
              // Rollen derselben Art abgleichen und, falls ähnlich, direkt
              // "Aktivieren & zuordnen" anbieten statt den Umweg über
              // /admin/funktionstraeger zu erzwingen.
              const inaktivVorschlag = z.matchVorschlagUserId
                ? null
                : (() => {
                    const { exakt, vorschlag } = findeNamensVorschlag(
                      z.externerName ?? "",
                      inaktiveKandidaten.filter(
                        (k) => k.typ === z.funktionstraegerTyp
                      )
                    );
                    return exakt ?? vorschlag;
                  })();
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
                    <div className="mt-1 flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">
                        Keine passende Person im Verein angelegt.
                      </p>
                      {/* Fallback: direkt eine neue Person anlegen statt den
                          Umweg über /admin/funktionstraeger zu erzwingen —
                          eine Platzhalter-E-Mail reicht, es geht nur darum,
                          einen Eintrag zum Zuordnen zu haben (siehe
                          zeitnehmerNeuAnlegenUndBestaetigen). */}
                      <form
                        action={zeitnehmerNeuAnlegenUndBestaetigen}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="zuordnungId" value={z.id} />
                        <Input
                          name="email"
                          type="email"
                          placeholder="E-Mail (Platzhalter reicht)"
                          required
                          className="h-8 min-w-56 flex-1"
                        />
                        <Button type="submit" size="xs" variant="outline">
                          Person anlegen &amp; zuordnen
                        </Button>
                      </form>
                    </div>
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
                  {inaktivVorschlag && (
                    <form
                      action={zeitnehmerInaktiveRolleAktivierenUndZuordnen}
                      className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2"
                    >
                      <input type="hidden" name="zuordnungId" value={z.id} />
                      <input
                        type="hidden"
                        name="rolleId"
                        value={inaktivVorschlag.rolleId}
                      />
                      <p className="text-xs text-muted-foreground">
                        Ähnlich:{" "}
                        <span className="font-medium text-foreground">
                          {inaktivVorschlag.name ?? inaktivVorschlag.email}
                        </span>{" "}
                        — als {inaktivVorschlag.typ === "zeitnehmer" ? "Zeitnehmer" : "Sekretär"}{" "}
                        aktuell inaktiv.
                      </p>
                      <ConfirmSubmitButton
                        confirmText={`${inaktivVorschlag.name ?? inaktivVorschlag.email} aktivieren und dieser Zuordnung zuordnen?`}
                        size="xs"
                        variant="outline"
                      >
                        Aktivieren &amp; zuordnen
                      </ConfirmSubmitButton>
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
              Termine ({offeneAnzahl} offen von {terminePerMannschaft.length})
            </CardTitle>
            <Link
              href={terminFilterHref({ nurOffene: !nurOffene })}
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
          {anzeigbareMannschaften.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={!mannschaftFilter ? "default" : "outline"}
                size="sm"
                render={<Link href={terminFilterHref({ mannschaftId: null })} />}
                nativeButton={false}
              >
                Alle Mannschaften
                <LinkSpinner />
              </Button>
              {anzeigbareMannschaften.map((m) => (
                <Button
                  key={m.id}
                  variant={mannschaftFilter === m.id ? "default" : "outline"}
                  size="sm"
                  render={<Link href={terminFilterHref({ mannschaftId: m.id })} />}
                  nativeButton={false}
                >
                  {m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name}
                  <LinkSpinner />
                </Button>
              ))}
            </div>
          )}
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
              // Je Rolle max. 1 Person (siehe ZEITNEHMER_ROLLE_MAX/
              // SEKRETAER_ROLLE_MAX in besetzung.ts) — ist eine Rolle für
              // diesen Termin schon besetzt, wird sie für ALLE Personen
              // ausgegraut angeboten, nicht nur für die bereits zugeordnete.
              // `ausgenommeneZuordnungId` blendet beim "Ersetzen" die eigene,
              // gleich zu löschende Zuordnung aus dieser Prüfung aus, sonst
              // ließe sich eine Rolle nicht durch eine andere Person ersetzen.
              // Bewusst NICHT herausgefiltert, sondern nur ausgegraut
              // (disabled): eine Rolle/Person kommentarlos aus der Liste
              // verschwinden zu lassen, sah eher wie ein Fehler aus als wie
              // eine bewusste Einschränkung — siehe auch
              // PersonSelectOption.disabled.
              function personOptionenFuer(ausgenommeneZuordnungId?: string) {
                const rolleBesetzt = (rolle: (typeof ZEITNEHMER_ROLLEN)[number]) =>
                  bestehende.some(
                    (z) =>
                      z.funktionstraegerTyp === rolle &&
                      z.id !== ausgenommeneZuordnungId
                  );
                return t.freiePersonen.flatMap((s) => {
                  const inaktiveRollen = inaktiveRollenProPerson.get(s.userId);
                  return ZEITNEHMER_ROLLEN.filter(
                    (rolle) => s.rollen.includes(rolle) || inaktiveRollen?.has(rolle)
                  ).map((rolle) => {
                    const rolleAktiv = s.rollen.includes(rolle);
                    const besetzt = rolleAktiv && rolleBesetzt(rolle);
                    return {
                      value: `${s.userId}|${rolle}`,
                      label: `${s.name ?? s.email} (${rolle === "zeitnehmer" ? "Zeitnehmer" : "Sekretär"})`,
                      disabled: !rolleAktiv || besetzt,
                      hinweis: !rolleAktiv
                        ? "Rolle deaktiviert"
                        : besetzt
                          ? "Rolle bereits besetzt"
                          : undefined,
                    };
                  });
                });
              }
              const personOptionen = personOptionenFuer();
              const auswaehlbareOptionen = personOptionen.filter(
                (o) => !o.disabled
              ).length;

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
                  {t.handballNetZeitnehmer && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      handball.net-Ansetzung: {t.handballNetZeitnehmer}
                    </p>
                  )}
                  <details className="group mt-1">
                    <summary className={cn(DISCLOSURE_KLASSE, "text-[0.7rem]")}>
                      <span className="group-open:hidden">
                        Bedarf: {t.zeitnehmerBedarf}
                        {t.zeitnehmerBedarfOverride != null && " (angepasst)"}
                      </span>
                      <span className="hidden group-open:inline">Schließen</span>
                    </summary>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <form
                        action={zeitnehmerBedarfUeberschreiben}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="terminId" value={t.id} />
                        <Label
                          htmlFor={`bedarf-${t.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Bedarf für diesen Termin
                        </Label>
                        <Input
                          id={`bedarf-${t.id}`}
                          name="bedarf"
                          type="number"
                          min={0}
                          defaultValue={t.zeitnehmerBedarfOverride ?? ""}
                          placeholder="Standard"
                          className="h-8 w-20"
                        />
                        <Button type="submit" size="xs" variant="outline">
                          Speichern
                        </Button>
                      </form>
                      {t.zeitnehmerBedarfOverride != null && (
                        <form action={zeitnehmerBedarfUeberschreiben}>
                          <input type="hidden" name="terminId" value={t.id} />
                          <Button type="submit" size="xs" variant="ghost">
                            Zurücksetzen (Standard)
                          </Button>
                        </form>
                      )}
                    </div>
                  </details>
                  {bestehende.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {bestehende.map((z) => {
                        // z.name ist bei "ohne Login"-Zuordnungen immer null
                        // — Fallback auf externerName, sonst würde der
                        // Abgleich für diese Personen immer als Abweichung
                        // gewertet, selbst wenn der Name passt.
                        const passt = t.handballNetZeitnehmer
                          ? angesetzteNamenPassenZu(
                              t.handballNetZeitnehmer,
                              z.name ?? z.externerName
                            )
                          : null;
                        // Eigene Optionsliste je zu ersetzender Zuordnung:
                        // deren eigene Rolle gilt hier NICHT als "bereits
                        // besetzt" (sie wird beim Ersetzen ja selbst
                        // gelöscht) — andere, tatsächlich noch belegte
                        // Rollen bleiben weiterhin ausgegraut.
                        const ersatzOptionen = personOptionenFuer(z.id);
                        const auswaehlbareErsatzOptionen = ersatzOptionen.filter(
                          (o) => !o.disabled
                        ).length;
                        return (
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
                              {passt === true && (
                                <Badge variant="secondary" className="ml-2">
                                  ✓ passt zu handball.net ({t.handballNetZeitnehmer})
                                </Badge>
                              )}
                              {passt === false && (
                                <Badge variant="warning" className="ml-2">
                                  ⚠ handball.net nennt {t.handballNetZeitnehmer}
                                </Badge>
                              )}
                            </span>
                            <div className="flex items-center gap-3">
                              {auswaehlbareErsatzOptionen > 0 && (
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
                                      <PersonSelect
                                        name="personRolle"
                                        placeholder="Ersatz wählen…"
                                        options={ersatzOptionen}
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
                        );
                      })}
                    </ul>
                  )}
                  {!t.besetzung.zeitnehmerSekretaerVoll && (
                    <div className="mt-2 flex flex-col gap-2">
                      {auswaehlbareOptionen === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Keine Person zu diesem Zeitpunkt verfügbar.
                        </p>
                      )}
                      {auswaehlbareOptionen > 0 &&
                        (bestehende.length === 0 ? (
                          <form
                            action={zeitnehmerZuordnen}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="terminId" value={t.id} />
                            <div className="min-w-56">
                              <PersonSelect
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
                                <PersonSelect
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
