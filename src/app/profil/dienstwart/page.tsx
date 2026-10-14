import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { istDienstwart } from "@/lib/dienstwart";
import { holeDienstwartDaten, type DienstwartTermin } from "@/lib/dienstwart-daten";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { gruppiereNachMonat, jetzt } from "@/lib/monats-gruppierung";
import { rundenspielTypLabel } from "@/lib/termin-label";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DisclosureSummary } from "@/components/disclosure-summary";
import { FahrtBearbeiten } from "@/components/fahrt-bearbeiten";
import { oeffentlicherFahrtText } from "@/lib/fahrgemeinschaft";
import { PersonSelect } from "@/components/person-select";
import { MannschaftFilterLeiste } from "@/components/mannschaft-filter-leiste";
import { MonatsgruppenListe } from "@/components/monatsgruppen-liste";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { WeitereOptionen } from "@/components/weitere-optionen";
import { SelbsteintragungLink } from "@/components/selbsteintragung-link";
import { appUrl } from "@/lib/app-url";
import {
  dienstAbmeldungAblehnen,
  dienstAbmeldungGenehmigen,
  dienstBedarfSetzen,
  diensteSelbstanmeldungDeaktivieren,
  diensteSelbstanmeldungLinkErneuern,
  dienstZuordnen,
  dienstZuordnungEntfernen,
} from "./actions";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  auswaertsspiel: "Auswärtsspiel",
};

function istOffen(t: DienstwartTermin) {
  return t.stellen.some((s) => s.eingeteilt.length < s.bedarf);
}

// Eigene Dienste (Fahrer, Kuchen, ...) einteilen. Wie die anderen Wart-Seiten: Vereinsadmins immer, sonst nur mit der Rolle Dienstwart.
export default async function DienstwartPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; mannschaft?: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  if (!session.user.istAdmin && !(await istDienstwart(vereinId, session.user.id))) notFound();

  const { filter, mannschaft: mannschaftFilter } = await searchParams;
  const nurOffene = filter === "offen";
  const { alleArten, termine, personen, mannschaftsListe, selbstanmeldungToken } = await holeDienstwartDaten(vereinId);
  const abmeldeanfragen = termine.flatMap((t) =>
    t.stellen.flatMap((s) => s.eingeteilt.filter((e) => e.abmeldungAngefragt).map((e) => ({ termin: t, stelle: s, person: e })))
  );

  const gefiltert = termine.filter(
    (t) => (!mannschaftFilter || t.mannschaftId === mannschaftFilter) && (!nurOffene || istOffen(t))
  );
  const monatsGruppen = gruppiereNachMonat(gefiltert, (t) => t.start, istOffen, jetzt());
  const offeneAnzahl = termine.filter(istOffen).length;
  const filterHref = (p: { nurOffene?: boolean; mannschaftId?: string | null }) => {
    const params = new URLSearchParams();
    const offen = p.nurOffene ?? nurOffene;
    const m = p.mannschaftId === undefined ? mannschaftFilter : p.mannschaftId;
    if (offen) params.set("filter", "offen");
    if (m) params.set("mannschaft", m);
    const q = params.toString();
    return `/profil/dienstwart${q ? `?${q}` : ""}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="font-heading text-2xl font-semibold">Dienstwart: eigene Dienste</h1>
          <HilfeHinweis anker="eigene-dienste" />
        </div>
        <p className="text-sm text-muted-foreground">
          Einteilung für die Dienste, die euer Verein selbst festgelegt hat
          {alleArten.length ? ` (${alleArten.filter((a) => a.aktiv).map((a) => a.name).join(", ") || "alle deaktiviert"})` : ""}.
          Eingeteilt werden kann jede Person des Vereins oder ein Name ohne Login (z.B. ein Elternteil).
        </p>
      </div>

      {alleArten.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Noch keine eigenen Dienste</CardTitle>
            <CardDescription>
              Eigene Dienste wie Fahrer oder Kuchen legt der Vereinsadmin unter Einstellungen → Dienste → „Eigenen Dienst anlegen“ an.
            </CardDescription>
          </CardHeader>
          {session.user.istAdmin && (
            <CardContent>
              <Link href="/admin/einstellungen#eigene-dienste" className="inline-flex min-h-11 items-center font-medium underline">
                Zu den Einstellungen
              </Link>
            </CardContent>
          )}
        </Card>
      ) : (
        <>
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Öffentliche Selbsteintragung</CardTitle>
            <CardDescription>
              Login-freier Link, über den sich Helfer (z.B. Eltern) selbst für eure eigenen Dienste eintragen. Es ist dieselbe
              Eintragungsseite wie für Zeitnehmer und Ordner: angeboten wird, was die Warte jeweils freigeschaltet haben. Einträge zählen
              sofort; wer im Verein ein Konto hat, wird über die E-Mail erkannt und bekommt eine Bestätigung.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {selbstanmeldungToken ? (
              <SelbsteintragungLink
                url={`${appUrl()}/eintragen/${selbstanmeldungToken}`}
                teilText={`Tragt euch hier für Dienste ein (${alleArten.filter((a) => a.aktiv).map((a) => a.name).join(", ")})${
                  alleArten.some((a) => a.aktiv && a.fahrgemeinschaft) ? " oder fahrt bei einem Fahrer mit" : ""
                }:`}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Noch nicht aktiviert.</p>
            )}
            <WeitereOptionen eingeklappt={!!selbstanmeldungToken}>
              <form action={diensteSelbstanmeldungLinkErneuern}>
                {selbstanmeldungToken ? (
                  <ConfirmSubmitButton
                    className="h-11 px-4 text-sm"
                    variant="outline"
                    confirmText="Neuen Link generieren? Der bisherige Link funktioniert danach nicht mehr."
                  >
                    Link neu generieren
                  </ConfirmSubmitButton>
                ) : (
                  <SubmitButton className="h-11 px-4 text-sm" variant="outline">
                    Aktivieren
                  </SubmitButton>
                )}
              </form>
              {selbstanmeldungToken && (
                <form action={diensteSelbstanmeldungDeaktivieren}>
                  <ConfirmSubmitButton
                    className="h-11 px-4 text-sm"
                    variant="ghost"
                    confirmText="Selbsteintragung für eigene Dienste deaktivieren? Der bisherige Link funktioniert danach nicht mehr."
                  >
                    Deaktivieren
                  </ConfirmSubmitButton>
                </form>
              )}
            </WeitereOptionen>
          </CardContent>
        </Card>

        {abmeldeanfragen.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Abmeldeanfragen ({abmeldeanfragen.length})</CardTitle>
              <CardDescription>
                Diese Personen möchten sich wieder abmelden. Die Einteilung bleibt bestehen, bis du zustimmst oder ablehnst.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {abmeldeanfragen.map(({ termin, stelle, person }) => (
                <div key={person.zuordnungId} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                  <p>
                    <span className="font-medium">{person.anzeigeName}</span> als {stelle.name} · {formatDateTime(termin.start)}
                    {termin.mannschaftLabel ? ` · ${termin.mannschaftLabel}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <form action={dienstAbmeldungGenehmigen}>
                      <input type="hidden" name="zuordnungId" value={person.zuordnungId} />
                      <SubmitButton className="h-11 px-4 text-sm" pendingText="Wird bestätigt…">
                        Abmeldung bestätigen
                      </SubmitButton>
                    </form>
                    <form action={dienstAbmeldungAblehnen}>
                      <input type="hidden" name="zuordnungId" value={person.zuordnungId} />
                      <SubmitButton className="h-11 px-4 text-sm" variant="outline" pendingText="Wird abgelehnt…">
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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <CardTitle className="text-base">
                Termine ({offeneAnzahl} offen von {termine.length})
              </CardTitle>
              <Link href={filterHref({ nurOffene: !nurOffene })} className="text-sm text-muted-foreground underline">
                {nurOffene ? "Alle anzeigen" : "Nur offene anzeigen"}
              </Link>
            </div>
            <CardDescription>Künftige Termine, für die mindestens ein eigener Dienst gilt.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <MannschaftFilterLeiste
              mannschaften={sortiereMannschaften(mannschaftsListe)}
              aktuelleMannschaftId={mannschaftFilter ?? null}
              hrefFuer={(mannschaftId) => filterHref({ mannschaftId })}
            />
            <MonatsgruppenListe
              gruppen={monatsGruppen}
              leerTextOhneFilter="Keine anstehenden Termine mit eigenen Diensten."
              renderItem={(t) => (
                <TerminKarte key={t.id} termin={t} personen={personen} />
              )}
            />
          </CardContent>
        </Card>
        </>
      )}
    </div>
  );
}

function TerminKarte({
  termin: t,
  personen,
}: {
  termin: DienstwartTermin;
  personen: { userId: string; name: string | null; email: string }[];
}) {
  const typLabel = t.typ === "rundenspiel" ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp) : (TYP_LABEL[t.typ] ?? t.typ);
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{formatDateTime(t.start)}</span>
        <Badge variant="outline">{typLabel}</Badge>
        {t.mannschaftLabel && <span>{t.mannschaftLabel}</span>}
        {t.ort && <span className="text-muted-foreground">{t.ort}</span>}
      </div>
      {t.beschreibung && <p className="mt-1 text-muted-foreground">{t.beschreibung}</p>}
      <div className="mt-2 flex flex-col gap-3">
        {t.stellen.map((s) => {
          const frei = s.bedarf - s.eingeteilt.length;
          const optionen = personen.map((p) => ({
            value: p.userId,
            label: p.name ? `${p.name} (${p.email})` : p.email,
            disabled: s.eingeteilt.some((e) => e.userId === p.userId),
            hinweis: s.eingeteilt.some((e) => e.userId === p.userId) ? "schon eingeteilt" : undefined,
          }));
          return (
            <div key={s.dienstArtId} className="flex flex-col gap-2 border-t pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={frei > 0 ? "warning" : "secondary"}>
                  {s.name}: {s.eingeteilt.length}/{s.bedarf}
                </Badge>
                {s.override != null && <span className="text-xs text-muted-foreground">Bedarf für diesen Termin angepasst</span>}
                {s.fahrgemeinschaft && (
                  <span className="text-xs text-muted-foreground">
                    {oeffentlicherFahrtText(s.eingeteilt.map((e) => ({ plaetze: e.plaetze ?? null, mitfahrer: (e.mitfahrer ?? []).map((m) => m.name) }))) ??
                      "Mitfahrplätze noch nicht angegeben"}
                  </span>
                )}
              </div>
              {s.eingeteilt.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {s.eingeteilt.map((e) => (
                    <li key={e.zuordnungId} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0">
                          {e.anzeigeName}
                          {e.ohneLogin ? " (ohne Login)" : ""}
                          {e.abmeldungAngefragt && <Badge variant="warning" className="ml-2">möchte sich abmelden</Badge>}
                        </span>
                        <form action={dienstZuordnungEntfernen}>
                          <input type="hidden" name="zuordnungId" value={e.zuordnungId} />
                          <ConfirmSubmitButton
                            className="h-11 px-4 text-sm"
                            variant="destructive"
                            confirmText={`${e.anzeigeName} als ${s.name} entfernen?${e.mitfahrer?.length ? " Die eingetragenen Mitfahrer werden dabei ebenfalls entfernt." : ""}`}
                          >
                            Entfernen
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                      {s.fahrgemeinschaft && (
                        <FahrtBearbeiten
                          zuordnungId={e.zuordnungId}
                          plaetze={e.plaetze ?? null}
                          fahrtHinweis={e.fahrtHinweis ?? null}
                          mitfahrer={e.mitfahrer ?? []}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {frei > 0 && (
                <form action={dienstZuordnen} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="terminId" value={t.id} />
                  <input type="hidden" name="dienstArtId" value={s.dienstArtId} />
                  <div className="sm:min-w-56 sm:flex-1">
                    <PersonSelect name="person" placeholder="Person wählen…" options={optionen} />
                  </div>
                  <span className="text-xs text-muted-foreground">oder</span>
                  <Input name="externerName" placeholder="Name ohne Login" maxLength={80} className="h-11 sm:w-44" />
                  <SubmitButton className="h-11 px-4 text-sm" variant="outline" pendingText="Wird eingeteilt…">
                    Einteilen
                  </SubmitButton>
                </form>
              )}
              <details className="group">
                <DisclosureSummary className="h-11 px-4 text-sm">
                  <span className="group-open:hidden">Bedarf anpassen</span>
                  <span className="hidden group-open:inline">Schließen</span>
                </DisclosureSummary>
                <form action={dienstBedarfSetzen} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="terminId" value={t.id} />
                  <input type="hidden" name="dienstArtId" value={s.dienstArtId} />
                  <Input
                    name="bedarf"
                    type="number"
                    min="0"
                    max="20"
                    step="1"
                    defaultValue={s.override ?? ""}
                    placeholder="Standard"
                    aria-label={`Bedarf ${s.name} für diesen Termin`}
                    className="h-11 w-24"
                  />
                  <SubmitButton className="h-11 px-4 text-sm" variant="outline" pendingText="Wird gespeichert…">
                    Speichern
                  </SubmitButton>
                  <span className="text-xs text-muted-foreground">Leer = Standard des Dienstes, 0 = hier nicht gebraucht.</span>
                </form>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
