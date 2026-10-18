import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { MitgliedFormular } from "@/components/mitglied-formular";
import { GESCHLECHTER, STATI, filtereMitglieder, istStatus, zaehleNachStatus } from "@/lib/mitglieder";
import { ladeMitglieder, ladeUeberfuehrungsPlan, vereinsverwaltungAktiv } from "@/lib/mitglieder-daten";
import { offeneUeberfuehrung } from "@/lib/mitglieder-ueberfuehrung";
import { SubmitButton } from "@/components/submit-button";
import { MitgliedMannschaftenBlock } from "@/components/mitglied-mannschaften-block";
import { saisonOptionen } from "@/lib/mitglied-mannschaften";
import { ladeVereinsMannschaften, ladeZuordnungen } from "@/lib/mitglied-mannschaften-daten";
import { saisonLabel } from "@/lib/saison";
import { funktionstraegerUebernehmen, mitgliedAendern, mitgliedAnlegen, mitgliedLoeschen } from "./actions";

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
function datum(d: string | null): string {
  return d ? DATUM.format(new Date(`${d}T00:00:00Z`)) : "–";
}

// Mitgliederliste des Vereins (Add-on Vereinsverwaltung, vom Systemadmin je Verein freigeschaltet).
export default async function MitgliederPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; mannschaft?: string }> }) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const schreiben = session.user.istAdmin;

  if (!(await vereinsverwaltungAktiv(vereinId))) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">Mitglieder</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Noch nicht freigeschaltet</CardTitle>
            <CardDescription>
              Die Vereinsverwaltung ist ein Zusatzangebot, das wir für euren Verein freischalten. Schreibt uns über „Feedback“ oder an info@deweconsulting.de, wenn ihr sie
              ausprobieren möchtet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/roadmap" className="inline-flex min-h-11 items-center font-medium underline">
              Was ist geplant?
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { q = "", status = "", mannschaft = "" } = await searchParams;
  const [alle, plan, mannschaften, zuordnungen] = await Promise.all([
    ladeMitglieder(vereinId),
    ladeUeberfuehrungsPlan(vereinId),
    ladeVereinsMannschaften(vereinId),
    ladeZuordnungen(vereinId),
  ]);
  const zahlen = zaehleNachStatus(alle);
  const aktuelleSaison = saisonLabel(new Date());
  const saisons = saisonOptionen(aktuelleSaison, zuordnungen.map((z) => z.saison));
  // Filter "Mannschaft": Mitglieder, die in der laufenden Saison dieser Mannschaft zugeordnet sind.
  const inMannschaft = mannschaft ? new Set(zuordnungen.filter((z) => z.mannschaftId === mannschaft && z.saison === aktuelleSaison).map((z) => z.mitgliedId)) : null;
  const liste = filtereMitglieder(alle, q, status).filter((m) => !inMannschaft || inMannschaft.has(m.id));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold">Mitglieder</h1>
          <HilfeHinweis anker="mitglieder" />
        </div>
        <p className="text-sm text-muted-foreground">
          {alle.length} Mitglieder: {zahlen.aktiv} aktiv, {zahlen.passiv} passiv, {zahlen.ausgetreten} ausgetreten. Die Daten sehen nur Vereinsadmins.
        </p>
      </div>

      {offeneUeberfuehrung(plan) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funktionsträger und Mitglieder abgleichen</CardTitle>
            <CardDescription>
              Funktionsträger gehören automatisch zu den Mitgliedern. Beim Abgleich wird niemand doppelt angelegt: gleiche E-Mail oder gleicher Name (ohne Widerspruch) wird mit dem
              vorhandenen Mitglied verknüpft.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <ul className="list-disc pl-5">
              {plan.neu.length > 0 && <li>{plan.neu.length} noch nicht in der Liste: {plan.neu.map((n) => `${n.name}, ${n.vorname}`).join("; ")}</li>}
              {plan.verknuepfen.length > 0 && <li>{plan.verknuepfen.length} passen zu vorhandenen Mitgliedern und werden verknüpft.</li>}
            </ul>
            {plan.pruefen.length > 0 && (
              <div>
                <p className="font-medium">Bitte selbst prüfen (nichts wird automatisch angelegt):</p>
                <ul className="list-disc pl-5">
                  {plan.pruefen.map((p) => (
                    <li key={p.person.userId}>
                      {p.person.name} ({p.person.email}) und Mitglied {p.mitglied.name}, {p.mitglied.vorname}: {p.grund}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">Ist es dieselbe Person, ergänzt die E-Mail-Adresse beim Mitglied und gleicht erneut ab. Sonst legt sie bei Bedarf mit dem Haken „Trotzdem neu anlegen“ an.</p>
              </div>
            )}
            {plan.unvollstaendig.length > 0 && (
              <p className="text-muted-foreground">
                Ohne Vor- und Nachnamen nicht übernehmbar: {plan.unvollstaendig.map((p) => p.name || p.email).join(", ")}. Ergänzt den Namen unter Funktionsträger.
              </p>
            )}
            {schreiben && (plan.neu.length > 0 || plan.verknuepfen.length > 0) && (
              <form action={funktionstraegerUebernehmen}>
                <SubmitButton className="w-full sm:w-auto" pendingText="Gleicht ab…">
                  Jetzt abgleichen
                </SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {schreiben && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Neues Mitglied</CardTitle>
          </CardHeader>
          <CardContent>
            <MitgliedFormular action={mitgliedAnlegen} absenden="Mitglied anlegen" idPraefix="neu" />
          </CardContent>
        </Card>
      )}

      <form className="flex flex-wrap items-end gap-2" role="search">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
          <label htmlFor="suche" className="text-sm font-medium">
            Suche
          </label>
          <Input id="suche" name="q" type="search" defaultValue={q} placeholder="Name oder E-Mail" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="statusfilter" className="text-sm font-medium">
            Status
          </label>
          <select
            id="statusfilter"
            name="status"
            defaultValue={istStatus(status) ? status : ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="">Alle</option>
            {Object.entries(STATI).map(([wert, label]) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {mannschaften.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mannschaftsfilter" className="text-sm font-medium">
              Mannschaft ({aktuelleSaison})
            </label>
            <select
              id="mannschaftsfilter"
              name="mannschaft"
              defaultValue={mannschaft}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="">Alle</option>
              {mannschaften.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="secondary" className="min-h-8">
          Filtern
        </Button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">
          {liste.length === alle.length ? "Alle Mitglieder" : `${liste.length} von ${alle.length} Mitgliedern`}
        </h2>
        {alle.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Mitglieder angelegt. Legt oben das erste an.</p>
        ) : liste.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kein Mitglied passt zu Suche und Filter.</p>
        ) : (
          liste.map((m) => (
            <Card key={m.id} id={`mitglied-${m.id}`} className="scroll-mt-6">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">
                    {m.name}, {m.vorname}
                  </CardTitle>
                  <Badge variant={m.status === "aktiv" ? "secondary" : "outline"}>{istStatus(m.status) ? STATI[m.status] : m.status}</Badge>
                </div>
                <CardDescription>
                  Eintritt {datum(m.eintrittsdatum)}
                  {m.austrittsdatum ? ` · Austritt ${datum(m.austrittsdatum)}` : ""}
                  {m.geburtsdatum ? ` · geboren ${datum(m.geburtsdatum)}` : ""}
                  {m.geschlecht && m.geschlecht in GESCHLECHTER ? ` · ${GESCHLECHTER[m.geschlecht as keyof typeof GESCHLECHTER]}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {(m.email || m.telefon) && (
                  <p className="break-words">
                    {m.email}
                    {m.email && m.telefon ? " · " : ""}
                    {m.telefon}
                  </p>
                )}
                {m.bemerkung && <p className="whitespace-pre-line text-muted-foreground">{m.bemerkung}</p>}
                <MitgliedMannschaftenBlock
                  mitgliedId={m.id}
                  zuordnungen={zuordnungen.filter((z) => z.mitgliedId === m.id)}
                  mannschaften={mannschaften}
                  saisons={saisons}
                  aktuelleSaison={aktuelleSaison}
                  schreiben={schreiben}
                />
                {schreiben && (
                  <div className="flex flex-col gap-2 border-t pt-3">
                    <details>
                      <summary className="min-h-11 cursor-pointer py-2 font-medium">Bearbeiten</summary>
                      <div className="pt-2">
                        <MitgliedFormular action={mitgliedAendern} werte={m} absenden="Änderungen speichern" idPraefix={`e-${m.id}`} />
                      </div>
                    </details>
                    <form action={mitgliedLoeschen}>
                      <input type="hidden" name="id" value={m.id} />
                      <ConfirmSubmitButton
                        variant="outline"
                        size="sm"
                        className="min-h-11 text-destructive"
                        confirmText="Mitglied endgültig löschen? Für einen Austritt stattdessen den Status auf „Ausgetreten“ setzen."
                      >
                        Löschen
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
