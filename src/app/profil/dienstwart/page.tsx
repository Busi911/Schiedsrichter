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
import { PersonSelect } from "@/components/person-select";
import { MannschaftFilterLeiste } from "@/components/mannschaft-filter-leiste";
import { MonatsgruppenListe } from "@/components/monatsgruppen-liste";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { dienstBedarfSetzen, dienstZuordnen, dienstZuordnungEntfernen } from "./actions";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
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
  const { alleArten, termine, personen, mannschaftsListe } = await holeDienstwartDaten(vereinId);

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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
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
              Eigene Dienste wie Fahrer oder Kuchen legt der Vereinsadmin unter Einstellungen → Eigene Dienste an.
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
              </div>
              {s.eingeteilt.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {s.eingeteilt.map((e) => (
                    <li key={e.zuordnungId} className="flex items-center justify-between gap-2">
                      <span>
                        {e.anzeigeName}
                        {e.ohneLogin ? " (ohne Login)" : ""}
                      </span>
                      <form action={dienstZuordnungEntfernen}>
                        <input type="hidden" name="zuordnungId" value={e.zuordnungId} />
                        <ConfirmSubmitButton
                          className="h-11 px-4 text-sm"
                          variant="destructive"
                          confirmText={`${e.anzeigeName} als ${s.name} entfernen?`}
                        >
                          Entfernen
                        </ConfirmSubmitButton>
                      </form>
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
