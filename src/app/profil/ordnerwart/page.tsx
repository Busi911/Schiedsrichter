import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, vereine } from "@/db/schema";
import {
  holeOrdnerEinsatzZahlen,
  holeOrdnerRelevanteTermine,
  istOrdnerwart,
  ORDNER_ROLLEN,
  ORDNER_ROLLE_LABEL,
} from "@/lib/ordnerwart";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "@/lib/dienste";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import {
  abmeldungAblehnen,
  abmeldungGenehmigen,
  ordnerMannschaftBedarfUmschalten,
  ordnerNeuAnlegenUndBestaetigen,
  ordnerSelbstanmeldungDeaktivieren,
  ordnerSelbstanmeldungLinkErneuern,
  ordnerVorschlagBestaetigen,
  ordnerOhneLoginZuordnen,
  ordnerZuordnen,
  ordnerZuordnungEntfernen,
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
import { DisclosureSummary } from "@/components/disclosure-summary";
import { MannschaftFilterLeiste } from "@/components/mannschaft-filter-leiste";
import { MonatsgruppenListe } from "@/components/monatsgruppen-liste";
import { gruppiereNachMonat, jetzt } from "@/lib/monats-gruppierung";
import { WeitereOptionen } from "@/components/weitere-optionen";
import { SelbsteintragungLink } from "@/components/selbsteintragung-link";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { LabeledSelect } from "@/components/labeled-select";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { rundenspielTypLabel } from "@/lib/termin-label";

const ORDNER_ROLLE_OPTIONEN = ORDNER_ROLLEN.map((r) => ({ value: r, label: ORDNER_ROLLE_LABEL[r] }));

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
};

export default async function OrdnerwartPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; mannschaft?: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  // Admins sehen (und bearbeiten) diese Seite unabhängig davon, ob sie
  // zusätzlich selbst die Ordnerwart-Rolle haben — sonst bräuchte der
  // Hauptadmin für jede Wart-Aufgabe im Verein zusätzlich eine eigene
  // Funktionsträger-Rolle, nur um z.B. Selbsteintragungen bestätigen zu
  // können.
  if (!session.user.istAdmin && !(await istOrdnerwart(vereinId, userId))) {
    notFound();
  }

  const { filter, mannschaft: mannschaftFilter } = await searchParams;
  const nurOffene = filter === "offen";

  const [personenListe, termineRoh, verein, alleMannschaften] = await Promise.all([
    holeOrdnerEinsatzZahlen(vereinId),
    holeOrdnerRelevanteTermine(vereinId),
    withTenant(vereinId, (tx) =>
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
    ),
    withTenant(vereinId, (tx) =>
      tx.query.mannschaften.findMany({ where: eq(mannschaften.vereinId, vereinId) })
    ),
  ]);
  const mannschaftenSortiert = sortiereMannschaften(alleMannschaften);
  const mannschaftenNachId = new Map(alleMannschaften.map((m) => [m.id, m]));

  const belegtProZeitpunktUndTermin = new Map<number, Map<string, string>>();
  for (const termin of termineRoh) {
    const zeitpunkt = termin.start.getTime();
    const map = belegtProZeitpunktUndTermin.get(zeitpunkt) ?? new Map();
    for (const z of termin.zuordnungen) {
      if (
        (ORDNER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp) &&
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
  const alleRelevantenTermine = termineRoh
    .map((termin) => {
      const mannschaft = termin.mannschaftId
        ? mannschaftenNachId.get(termin.mannschaftId)
        : null;
      const luecken = ORDNER_ROLLEN
        .map((rolle) => {
          const bedarf = verein
            ? bedarfFuer(
                verein,
                termin.typ,
                rolle,
                termin.pflichtspiel,
                termin.freundschaftsTyp,
                undefined,
                mannschaftBedarfDeaktiviertFuer(mannschaft, rolle)
              )
            : 0;
          const vorhanden = termin.zuordnungen.filter(
            (z) => z.funktionstraegerTyp === rolle
          ).length;
          return { rolle, bedarf, vorhanden };
        })
        .filter((l) => l.bedarf > 0);

      const belegteAmZeitpunkt =
        belegtProZeitpunktUndTermin.get(termin.start.getTime()) ?? new Map();
      const freiePersonen = personenListe.filter((s) => {
        const belegtBeiTerminId = belegteAmZeitpunkt.get(s.userId);
        return !belegtBeiTerminId || belegtBeiTerminId === termin.id;
      });

      return {
        ...termin,
        luecken,
        vollstaendig: luecken.every((l) => l.vorhanden >= l.bedarf),
        freiePersonen,
      };
    })
    .filter((t) => t.luecken.length > 0)
    .sort((a, b) => Number(a.vollstaendig) - Number(b.vollstaendig));
  // Nur Mannschaften als Filter anbieten, die auch mindestens einen
  // relevanten Termin haben — sonst führte ein Klick nur zu "Keine
  // anstehenden Termine" (gleiches Prinzip wie in zeitnehmerwart/page.tsx).
  const mannschaftenMitTerminen = new Set(
    alleRelevantenTermine.map((t) => t.mannschaftId).filter((id): id is string => !!id)
  );
  const anzeigbareMannschaften = mannschaftenSortiert.filter((m) =>
    mannschaftenMitTerminen.has(m.id)
  );
  const terminePerMannschaft = mannschaftFilter
    ? alleRelevantenTermine.filter((t) => t.mannschaftId === mannschaftFilter)
    : alleRelevantenTermine;
  const offeneAnzahl = terminePerMannschaft.filter((t) => !t.vollstaendig).length;
  const relevanteTermine = nurOffene
    ? terminePerMannschaft.filter((t) => !t.vollstaendig)
    : terminePerMannschaft;
  const monatsGruppen = gruppiereNachMonat(
    relevanteTermine,
    (t) => t.start,
    (t) => !t.vollstaendig,
    jetzt()
  );

  // Baut die Termine-Filter-URL unter Beibehaltung des jeweils anderen,
  // unabhängigen Filters (offen/Mannschaft lassen sich kombinieren) —
  // analog zu terminFilterHref in zeitnehmerwart/page.tsx.
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
    return qs ? `?${qs}` : "/profil/ordnerwart";
  }

  // Über die öffentliche Selbsteintragung erfasste Personen, die noch
  // keiner echten Person zugeordnet wurden (siehe
  // ordnerSelbstEintragenOeffentlich in ordner-eintragen/[token]/actions.ts)
  // — zur Bestätigung/Korrektur durch den Wart (siehe
  // ordnerVorschlagBestaetigen). Explizit auf ORDNER_ROLLEN gefiltert, da
  // "selbst_eingetragen_oeffentlich" dieselbe quelle auch für Zeitnehmer/
  // Sekretär-Zuordnungen ist (siehe analoger Filter in
  // profil/zeitnehmerwart/page.tsx).
  const unbestaetigteSelbsteintragungen = termineRoh.flatMap((t) =>
    t.zuordnungen
      .filter(
        (z) =>
          z.quelle === "selbst_eingetragen_oeffentlich" &&
          !z.userId &&
          (ORDNER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp)
      )
      .map((z) => ({ ...z, termin: t }))
  );

  // Personen, die sich über /profil selbst wieder abmelden wollten (siehe
  // selbstAbmelden in profil/actions.ts) — die Zuordnung besteht bewusst
  // noch, bis hier bestätigt oder abgelehnt wird (siehe
  // abmeldungGenehmigen/abmeldungAblehnen unten).
  const abmeldeanfragen = termineRoh.flatMap((t) =>
    t.zuordnungen
      .filter((z) => z.abmeldungAngefragtAm != null)
      .map((z) => ({ ...z, termin: t }))
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <h1 className="font-heading text-2xl font-semibold">
          Ordner-/Kioskdienst-/Kassiererwart
        </h1>
        <p className="text-sm text-muted-foreground">
          Übersicht über alle Ordner-/Kioskdienst-/Kassierer-Helfer im
          Verein und ihre Einsätze, sowie Termine mit entsprechendem Bedarf.
          Sie melden sich normalerweise selbst an (eingeloggt über /profil
          oder login-frei über den Link unten) — hier lässt sich zusätzlich
          manuell zuordnen, entfernen oder ersetzen.
        </p>
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Öffentliche Selbsteintragung</CardTitle>
          <CardDescription>
            Login-freier Link, über den sich Personen (z.B. Eltern eines
            Kaders) selbst als Ordner/Kioskdienst/Kassierer eintragen können
            — gefiltert nach Mannschaft. Namen werden dabei automatisch mit
            bereits angelegten Funktionsträgern abgeglichen; bei Unsicherheit
            landet der Eintrag unten zur Bestätigung.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {verein?.ordnerSelbstanmeldungToken ? (
            <SelbsteintragungLink
              url={`${appUrl()}/eintragen/${verein.ordnerSelbstanmeldungToken}`}
              teilText="Tragt euch hier für Dienste ein (Ordner/Kioskdienst/Kassierer):"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Noch nicht aktiviert.
            </p>
          )}
          <WeitereOptionen eingeklappt={!!verein?.ordnerSelbstanmeldungToken}>
            <form action={ordnerSelbstanmeldungLinkErneuern}>
              {/* Langer Label-Text erzwang auf schmalen Bildschirmen
                  horizontales Scrollen der ganzen Seite (Button-Basisklasse
                  ist whitespace-nowrap) — siehe gleicher Kommentar in
                  profil/zeitnehmerwart/page.tsx. */}
              {verein?.ordnerSelbstanmeldungToken ? (
                <ConfirmSubmitButton className="h-11 px-4 text-sm"
                  confirmText="Neuen Link generieren? Der bisherige Link funktioniert danach nicht mehr."
                  variant="outline"
                >
                  Link neu generieren
                </ConfirmSubmitButton>
              ) : (
                <SubmitButton className="h-11 px-4 text-sm" variant="outline">
                  Aktivieren
                </SubmitButton>
              )}
            </form>
            {verein?.ordnerSelbstanmeldungToken && (
              <form action={ordnerSelbstanmeldungDeaktivieren}>
                <ConfirmSubmitButton className="h-11 px-4 text-sm"
                  confirmText="Selbsteintragung deaktivieren? Der bisherige Link funktioniert danach nicht mehr."
                  variant="ghost"
                >
                  Deaktivieren
                </ConfirmSubmitButton>
              </form>
            )}
          </WeitereOptionen>
        </CardContent>
      </Card>

      {mannschaftenSortiert.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bedarf pro Mannschaft</CardTitle>
            <CardDescription>
              Für Mannschaften ohne eigene Heimspiele mit Publikum (z.B.
              manche Jugend-Mannschaften) lässt sich der Ordner-/
              Kioskdienst-/Kassierer-Bedarf hier komplett abschalten. Wirkt
              auf alle Termine der jeweiligen Mannschaft, auch bereits
              bestehende offene.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {mannschaftenSortiert.map((m) => {
              const label = m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name;
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-lg border p-2 text-sm"
                >
                  <span>{label}</span>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["ordner", m.ordnerBedarfDeaktiviert],
                        ["kioskdienst", m.kioskdienstBedarfDeaktiviert],
                        ["kassierer", m.kassiererBedarfDeaktiviert],
                      ] as const
                    ).map(([rolle, deaktiviert]) => (
                      <form key={rolle} action={ordnerMannschaftBedarfUmschalten}>
                        <input type="hidden" name="mannschaftId" value={m.id} />
                        <input type="hidden" name="rolle" value={rolle} />
                        <SubmitButton className="h-11 px-4 text-sm"
                          variant={deaktiviert ? "outline" : "secondary"}
                        >
                          {ROLLE_LABEL[rolle]} {deaktiviert ? "deaktiviert" : "aktiv"}
                        </SubmitButton>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
              const kandidaten = personenListe
                .filter((s) =>
                  s.rollen.includes(
                    z.funktionstraegerTyp as (typeof ORDNER_ROLLEN)[number]
                  )
                )
                .map((s) => ({ value: s.userId, label: s.name ?? s.email }));
              return (
                <div key={z.id} className="rounded-lg border p-3 text-sm">
                  <p>
                    <span className="font-medium">{z.externerName}</span> als{" "}
                    {ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}{" "}
                    · {formatDateTime(z.termin.start)}
                    {z.termin.beschreibung ? ` · ${z.termin.beschreibung}` : ""}
                  </p>
                  {kandidaten.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Keine passende Person im Verein angelegt.
                    </p>
                  ) : (
                    <form
                      action={ordnerVorschlagBestaetigen}
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="zuordnungId" value={z.id} />
                      <div className="min-w-56">
                        <LabeledSelect triggerClassName="h-11 text-base"
                          name="userId"
                          placeholder="Person wählen…"
                          defaultValue={z.matchVorschlagUserId ?? undefined}
                          options={kandidaten}
                          required
                        />
                      </div>
                      <SubmitButton className="h-11 px-4 text-sm">Bestätigen</SubmitButton>
                    </form>
                  )}
                  {/* Immer verfügbar, nicht nur als Fallback ohne
                      Kandidaten: die vorgeschlagenen Kandidaten oben können
                      allesamt nicht zutreffen (z.B. bei Vornamen wie "Anika"
                      ohne erkennbaren Bezug zu bereits angelegten Personen)
                      — dann direkt aus der Selbsteintragung heraus eine neue
                      Person mit dieser Rolle anlegen, statt den Umweg über
                      /admin/funktionstraeger zu erzwingen. Analog zum
                      gleichen Fallback in profil/zeitnehmerwart/page.tsx. */}
                  <details className="group mt-1.5">
                    <DisclosureSummary className="h-11 px-4 text-sm">
                      <span className="group-open:hidden">
                        Neue Person anlegen
                      </span>
                      <span className="hidden group-open:inline">
                        Schließen
                      </span>
                    </DisclosureSummary>
                    <form
                      action={ordnerNeuAnlegenUndBestaetigen}
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="zuordnungId" value={z.id} />
                      <Input
                        name="email"
                        type="email"
                        placeholder="E-Mail (Platzhalter reicht)"
                        required
                        className="h-11 min-w-56 flex-1 px-3 text-base"
                      />
                      <SubmitButton className="h-11 px-4 text-sm" variant="outline">
                        {z.externerName} anlegen &amp; als{" "}
                        {ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}{" "}
                        bestätigen
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {abmeldeanfragen.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Abmeldeanfragen ({abmeldeanfragen.length})
            </CardTitle>
            <CardDescription>
              Diese Personen möchten sich wieder abmelden — die Zuordnung
              bleibt bestehen, bis du zustimmst oder ablehnst.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {abmeldeanfragen.map((z) => (
              <div
                key={z.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <p>
                  <span className="font-medium">{z.name ?? z.externerName}</span> als{" "}
                  {ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}{" "}
                  · {formatDateTime(z.termin.start)}
                  {z.termin.beschreibung ? ` · ${z.termin.beschreibung}` : ""}
                </p>
                <div className="flex gap-2">
                  <form action={abmeldungGenehmigen}>
                    <input type="hidden" name="zuordnungId" value={z.id} />
                    <SubmitButton className="h-11 px-4 text-sm">Bestätigen</SubmitButton>
                  </form>
                  <form action={abmeldungAblehnen}>
                    <input type="hidden" name="zuordnungId" value={z.id} />
                    <SubmitButton className="h-11 px-4 text-sm" variant="outline">
                      Ablehnen
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ordner-/Kioskdienst-/Kassierer-Helfer im Verein
          </CardTitle>
          <CardDescription>
            Anzahl bereits absolvierter Einsätze (in beiden Rollen
            zusammen).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {personenListe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine aktiven Ordner-/Kioskdienst-/Kassierer-Helfer im Verein.{" "}
              <Link href="/admin/funktionstraeger" className="underline">
                Jetzt anlegen
              </Link>
              .
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
                {personenListe.map((s) => (
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
              className="text-sm text-muted-foreground underline"
            >
              {nurOffene ? "Alle anzeigen" : "Nur offene anzeigen"}
            </Link>
          </div>
          <CardDescription>
            Freundschaftsspiele, Turniere und Rundenspiele mit konfiguriertem
            Ordner-/Kioskdienst-/Kassierer-Bedarf. Die Auswahl zeigt nur
            Personen, die zu diesem Zeitpunkt nicht bereits an einem anderen
            Termin eingeteilt sind.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <MannschaftFilterLeiste
            mannschaften={anzeigbareMannschaften}
            aktuelleMannschaftId={mannschaftFilter ?? null}
            hrefFuer={(mannschaftId) => terminFilterHref({ mannschaftId })}
          />
          <MonatsgruppenListe
            gruppen={monatsGruppen}
            leerTextOhneFilter="Keine anstehenden Termine mit Ordner-/Kioskdienst-/Kassierer-Bedarf."
            renderItem={(t) => {
              const typLabel =
                t.typ === "rundenspiel"
                  ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                  : (TYP_LABEL[t.typ] ?? t.typ);
              const bestehende = t.zuordnungen.filter((z) =>
                (ORDNER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp)
              );
              // Bewusst NICHT herausgefiltert, sondern nur ausgegraut
              // (disabled), wenn die Person für diese Rolle bereits
              // eingetragen ist — siehe LabeledSelectOption.disabled. Die
              // vorhanden/bedarf-Prüfung bleibt dagegen ein echter Filter:
              // eine Rolle ohne freie Kapazität soll gar nicht erst
              // auftauchen.
              const personOptionen = t.freiePersonen.flatMap((s) =>
                t.luecken
                  .filter((l) => l.vorhanden < l.bedarf && s.rollen.includes(l.rolle))
                  .map((l) => ({
                    value: `${s.userId}|${l.rolle}`,
                    label: `${s.name ?? s.email} (${ROLLE_LABEL[l.rolle]})`,
                    disabled: bestehende.some(
                      (z) =>
                        z.userId === s.userId && z.funktionstraegerTyp === l.rolle
                    ),
                  }))
              );
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
                    {t.luecken.map((l) => (
                      <Badge
                        key={l.rolle}
                        variant={l.vorhanden >= l.bedarf ? "secondary" : "outline"}
                      >
                        {ROLLE_LABEL[l.rolle]}: {l.vorhanden}/{l.bedarf}
                      </Badge>
                    ))}
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
                              {ROLLE_LABEL[z.funktionstraegerTyp] ??
                                z.funktionstraegerTyp}
                              : {z.name ?? z.externerName ?? z.email}
                              {z.externerName && !z.email
                                ? " (ohne Login)"
                                : ""}
                            </span>
                            <div className="flex items-center gap-3">
                              {auswaehlbareOptionen > 0 && (
                                <details className="group">
                                  <DisclosureSummary className="h-11 px-4 text-sm">
                                    <span className="group-open:hidden">
                                      Ersetzen
                                    </span>
                                    <span className="hidden group-open:inline">
                                      Schließen
                                    </span>
                                  </DisclosureSummary>
                                  <form
                                    action={ordnerZuordnen}
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
                                      <LabeledSelect triggerClassName="h-11 text-base"
                                        name="personRolle"
                                        placeholder="Ersatz wählen…"
                                        options={personOptionen}
                                        required
                                      />
                                    </div>
                                    <SubmitButton className="h-11 px-4 text-sm" variant="outline">
                                      Ersetzen
                                    </SubmitButton>
                                  </form>
                                </details>
                              )}
                              <form action={ordnerZuordnungEntfernen}>
                                <input
                                  type="hidden"
                                  name="zuordnungId"
                                  value={z.id}
                                />
                                <ConfirmSubmitButton className="h-11 px-4 text-sm"
                                  confirmText={`${z.name ?? z.externerName ?? z.email} entfernen?`}
                                  variant="destructive"
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
                  {auswaehlbareOptionen === 0 ? (
                    !t.vollstaendig && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Keine Person zu diesem Zeitpunkt verfügbar.
                      </p>
                    )
                  ) : bestehende.length === 0 ? (
                    <form
                      action={ordnerZuordnen}
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="terminId" value={t.id} />
                      <div className="min-w-56">
                        <LabeledSelect triggerClassName="h-11 text-base"
                          name="personRolle"
                          placeholder="Person wählen…"
                          options={personOptionen}
                          required
                        />
                      </div>
                      <SubmitButton className="h-11 px-4 text-sm">Zuordnen</SubmitButton>
                    </form>
                  ) : (
                    <details className="group mt-2">
                      <DisclosureSummary className="h-11 px-4 text-sm">
                        <span className="group-open:hidden">
                          Weitere Person hinzufügen
                        </span>
                        <span className="hidden group-open:inline">
                          Schließen
                        </span>
                      </DisclosureSummary>
                      <form
                        action={ordnerZuordnen}
                        className="mt-2 flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="terminId" value={t.id} />
                        <div className="min-w-56">
                          <LabeledSelect triggerClassName="h-11 text-base"
                            name="personRolle"
                            placeholder="Person wählen…"
                            options={personOptionen}
                            required
                          />
                        </div>
                        <SubmitButton className="h-11 px-4 text-sm">
                          Weitere zuordnen
                        </SubmitButton>
                      </form>
                    </details>
                  )}
                  {/* Ohne Login immer anbieten (Fallback, z.B. Elternteil) — Pendant zum Zeitnehmerwart. */}
                  <details className="group mt-2">
                    <DisclosureSummary className="h-11 px-4 text-sm">
                      <span className="group-open:hidden">Ohne Login zuordnen (Fallback)</span>
                      <span className="hidden group-open:inline">Schließen</span>
                    </DisclosureSummary>
                    <form action={ordnerOhneLoginZuordnen} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="terminId" value={t.id} />
                      <Input name="name" placeholder="Name ohne Login (z.B. Elternteil)" required className="h-11 min-w-56 flex-1 px-3 text-base" />
                      <div className="w-40">
                        <LabeledSelect triggerClassName="h-11 text-base" name="rolle" placeholder="Rolle…" options={ORDNER_ROLLE_OPTIONEN} required />
                      </div>
                      <SubmitButton className="h-11 px-4 text-sm" variant="ghost">
                        Zuordnen
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              );
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
