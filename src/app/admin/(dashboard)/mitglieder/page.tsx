import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { MitgliedFormular } from "@/components/mitglied-formular";
import { GESCHLECHTER, STATI, istStatus, zaehleNachStatus } from "@/lib/mitglieder";
import { beitrittEingeschaltet, ladeMitglieder, ladeMitgliedsarten, ladeUeberfuehrungsPlan, vereinsverwaltungAktiv } from "@/lib/mitglieder-daten";
import { fehlendeStandardArten } from "@/lib/mitgliedsarten";
import { waehleMitglieder } from "@/lib/mitglieder-auswahl";
import { findeMitglied, offeneUeberfuehrung } from "@/lib/mitglieder-ueberfuehrung";
import { holeOeffentlichenSlug, ladeAntraege } from "@/lib/beitritt-daten";
import { alterAm } from "@/lib/beitritt";
import { formatDatum } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { MitgliedMannschaftenBlock } from "@/components/mitglied-mannschaften-block";
import { saisonOptionen } from "@/lib/mitglied-mannschaften";
import { ladeVereinsMannschaften, ladeZuordnungen } from "@/lib/mitglied-mannschaften-daten";
import { saisonLabel } from "@/lib/saison";
import {
  funktionstraegerNameErgaenzen,
  beitrittAblehnen,
  beitrittAnnehmen,
  beitrittAntragLoeschen,
  funktionstraegerUebernehmen,
  mitgliedAendern,
  mitgliedAnlegen,
  mitgliedLoeschen,
  mitgliederImportieren,
  mitgliedsartAnlegen,
  mitgliedsartLoeschen,
  mitgliedsartUmbenennen,
  standardArtenAnlegen,
} from "./actions";

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
function datum(d: string | null): string {
  return d ? DATUM.format(new Date(`${d}T00:00:00Z`)) : "–";
}

// Mitgliederliste des Vereins (Add-on Vereinsverwaltung, vom Systemadmin je Verein freigeschaltet).
export default async function MitgliederPage({ searchParams }: { searchParams: Promise<{
    q?: string;
    status?: string;
    mannschaft?: string;
    art?: string;
    importAngelegt?: string;
    importUebersprungen?: string;
    importFehler?: string;
    importArten?: string;
    importProbleme?: string;
  }> }) {
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

  const { q = "", status = "", mannschaft = "", art = "", ...importErgebnis } = await searchParams;
  const [alle, plan, mannschaften, zuordnungen, arten, antraege, oeffentlicherSlug, beitrittLaeuft] = await Promise.all([
    ladeMitglieder(vereinId),
    ladeUeberfuehrungsPlan(vereinId),
    ladeVereinsMannschaften(vereinId),
    ladeZuordnungen(vereinId),
    ladeMitgliedsarten(vereinId),
    ladeAntraege(vereinId),
    holeOeffentlichenSlug(vereinId),
    beitrittEingeschaltet(vereinId),
  ]);
  const offeneAntraege = antraege.filter((a) => a.status === "offen").sort((a, b) => (a.erstelltAm?.getTime() ?? 0) - (b.erstelltAm?.getTime() ?? 0));
  const bearbeiteteAntraege = antraege.filter((a) => a.status !== "offen").slice(0, 30);
  const mannschaftsName = new Map(mannschaften.map((m) => [m.id, m.name]));
  const artName = new Map(arten.map((a) => [a.id, a.name]));
  const zahlen = zaehleNachStatus(alle);
  const aktuelleSaison = saisonLabel(new Date());
  const saisons = saisonOptionen(aktuelleSaison, zuordnungen.map((z) => z.saison));
  // Suche, Status, Art und Mannschaft (laufende Saison): dieselbe Auswahl nutzt der Excel-Export.
  const liste = waehleMitglieder(alle, zuordnungen, { q, status, art, mannschaft, saison: aktuelleSaison });
  const exportParams = new URLSearchParams(Object.entries({ q, status, art, mannschaft }).filter(([, v]) => v));

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
              <div className="flex flex-col gap-2">
                <p className="font-medium">Name unvollständig (so lassen sie sich nicht als Mitglied übernehmen):</p>
                {plan.unvollstaendig.map((p) => {
                  const einWort = !!p.name?.trim() && !/[\s,]/.test(p.name.trim());
                  return schreiben ? (
                    <form key={p.userId} action={funktionstraegerNameErgaenzen} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="userId" value={p.userId} />
                      {!einWort && (
                        <div className="flex min-w-0 flex-1 basis-36 flex-col gap-1">
                          <label htmlFor={`vn-${p.userId}`} className="text-xs text-muted-foreground">
                            Vorname
                          </label>
                          <Input id={`vn-${p.userId}`} name="vorname" required maxLength={100} autoComplete="off" />
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 basis-36 flex-col gap-1">
                        <label htmlFor={`nn-${p.userId}`} className="text-xs text-muted-foreground">
                          {einWort ? `Nachname zu „${p.name?.trim()}“` : `Nachname (${p.email})`}
                        </label>
                        <Input id={`nn-${p.userId}`} name="nachname" required maxLength={100} autoComplete="off" />
                      </div>
                      <SubmitButton variant="outline" className="w-full sm:w-auto" pendingText="Ergänzt…">
                        Ergänzen
                      </SubmitButton>
                    </form>
                  ) : (
                    <p key={p.userId} className="text-muted-foreground">
                      {p.name?.trim() || p.email}
                    </p>
                  );
                })}
                <p className="text-xs text-muted-foreground">Der Name wird auch beim Funktionsträger ergänzt.</p>
              </div>
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
            <MitgliedFormular action={mitgliedAnlegen} arten={arten} absenden="Mitglied anlegen" idPraefix="neu" />
          </CardContent>
        </Card>
      )}

      <Card id="antraege" className="scroll-mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Beitrittsanträge</CardTitle>
            {offeneAntraege.length > 0 && <Badge variant="warning">{offeneAntraege.length} offen</Badge>}
          </div>
          <CardDescription>
            {beitrittLaeuft && oeffentlicherSlug ? (
              <>
                Der Online-Beitritt ist eingeschaltet. Link zum Formular: <code className="break-all">/verein/{oeffentlicherSlug}/beitritt</code>
              </>
            ) : (
              <>
                Der Online-Beitritt ist ausgeschaltet.{" "}
                <Link href="/admin/einstellungen#online-beitritt" className="underline">
                  Unter Einstellungen → Online-Beitritt einschalten
                </Link>
                .
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {offeneAntraege.length === 0 && <p className="text-muted-foreground">Keine offenen Anträge.</p>}
          {offeneAntraege.map((a) => {
            const doppelt = findeMitglied({ vorname: a.vorname, name: a.name, email: a.email, geburtsdatum: a.geburtsdatum }, alle);
            const e = a.einwilligungen ?? {};
            return (
              <div key={a.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {a.name}, {a.vorname}
                  </p>
                  {a.geburtsdatum && (
                    <Badge variant="outline">
                      {alterAm(a.geburtsdatum)} Jahre{alterAm(a.geburtsdatum) < 18 ? " (minderjährig)" : ""}
                    </Badge>
                  )}
                </div>
                <p className="break-words text-muted-foreground">
                  {a.email}
                  {a.telefon ? ` · ${a.telefon}` : ""}
                  {a.geburtsdatum ? ` · geboren ${datum(a.geburtsdatum)}` : ""}
                  {a.erstelltAm ? ` · eingegangen ${formatDatum(a.erstelltAm)}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {a.mannschaftId ? `Wunsch: ${mannschaftsName.get(a.mannschaftId) ?? "Mannschaft"} · ` : ""}Fotos/Videos: {e.fotos ? "erlaubt" : "nicht erlaubt"}
                </p>
                {doppelt && (
                  <p className="rounded-md border border-amber-500/60 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    Es gibt wohl schon ein Mitglied „{doppelt.mitglied.name}, {doppelt.mitglied.vorname}“. Bitte prüfen, bevor ihr annehmt.
                  </p>
                )}
                {schreiben && (
                  <div className="flex flex-col gap-2 border-t pt-2">
                    <form action={beitrittAnnehmen} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="id" value={a.id} />
                      {doppelt && (
                        <label className="flex min-h-11 items-center gap-2">
                          <input type="checkbox" name="trotzdem" className="size-4" />
                          <span>Trotzdem als neues Mitglied annehmen</span>
                        </label>
                      )}
                      <SubmitButton className="w-full sm:w-auto" pendingText="Nimmt an…">
                        Annehmen
                      </SubmitButton>
                    </form>
                    <form action={beitrittAblehnen} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
                        <label htmlFor={`grund-${a.id}`} className="text-xs text-muted-foreground">
                          Hinweis an die Person (freiwillig)
                        </label>
                        <Input id={`grund-${a.id}`} name="grund" maxLength={500} />
                      </div>
                      <ConfirmSubmitButton variant="outline" className="w-full text-destructive sm:w-auto" confirmText="Antrag ablehnen? Die Person bekommt eine Mail.">
                        Ablehnen
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
          {bearbeiteteAntraege.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 font-medium">Zuletzt bearbeitet ({bearbeiteteAntraege.length})</summary>
              <ul className="mt-1 flex flex-col gap-1 text-muted-foreground">
                {bearbeiteteAntraege.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3">
                    <span>
                      {a.name}, {a.vorname}: {a.status === "angenommen" ? "angenommen" : "abgelehnt"}
                    </span>
                    {schreiben && (
                      <form action={beitrittAntragLoeschen}>
                        <input type="hidden" name="id" value={a.id} />
                        <ConfirmSubmitButton variant="ghost" size="sm" className="min-h-11 text-destructive" confirmText="Antrag endgültig löschen? Das Mitglied (falls angenommen) bleibt bestehen.">
                          Löschen
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">Bearbeitete Anträge bleiben als Nachweis der Einwilligungen gespeichert, bis ihr sie löscht (z.B. auf Wunsch der Person).</p>
            </details>
          )}
        </CardContent>
      </Card>

      {importErgebnis.importAngelegt !== undefined && (
        <Alert>
          <AlertTitle>Import abgeschlossen</AlertTitle>
          <AlertDescription>
            <p>
              {importErgebnis.importAngelegt} angelegt, {importErgebnis.importUebersprungen ?? "0"} übersprungen (gibt es schon), {importErgebnis.importFehler ?? "0"} mit Fehler.
              {importErgebnis.importArten ? ` Neue Arten: ${importErgebnis.importArten}.` : ""}
            </p>
            {importErgebnis.importProbleme && (
              <ul className="mt-1 list-disc pl-5">
                {importErgebnis.importProbleme.split(" | ").map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <details className="rounded-xl border bg-card px-4">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">Excel-Import und -Export</summary>
        <div className="flex flex-col gap-3 pb-4 text-sm">
          <p className="text-muted-foreground">
            Der Export enthält die Mitglieder mit den aktuellen Filtern von unten, zusätzlich die Mannschaften der laufenden Saison. Er enthält Personendaten und wird im
            Vereinsprotokoll vermerkt. Der Import legt neue Mitglieder aus einer Excel-Datei an (am besten die Vorlage verwenden); wer es schon gibt, wird übersprungen.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`/admin/mitglieder/export${exportParams.size ? `?${exportParams}` : ""}`} className={buttonVariants({ variant: "outline" })}>
              Als Excel exportieren
            </a>
            {schreiben && (
              <a href="/admin/mitglieder/export?vorlage=1" className={buttonVariants({ variant: "outline" })}>
                Vorlage herunterladen
              </a>
            )}
          </div>
          {schreiben && (
            <form action={mitgliederImportieren} className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor="mitglieder-datei" className="text-sm font-medium">
                  Excel-Datei (.xlsx)
                </label>
                <input id="mitglieder-datei" name="datei" type="file" accept=".xlsx" required className="max-w-full text-sm" />
              </div>
              <SubmitButton className="w-full sm:w-auto" pendingText="Importiert…">
                Importieren
              </SubmitButton>
            </form>
          )}
        </div>
      </details>

      {schreiben && (
        <details className="rounded-xl border bg-card px-4">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">Arten der Mitgliedschaft verwalten ({arten.length})</summary>
          <div className="flex flex-col gap-3 pb-4 text-sm">
            <p className="text-muted-foreground">
              Eigene Arten wie „Fördermitglied“ oder „Ehrenmitglied“. Beim Mitglied wählt ihr eine davon aus; eine gelöschte Art lässt die Mitglieder bestehen (ohne Angabe).
            </p>
            {arten.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2">
                <form action={mitgliedsartUmbenennen} className="flex min-w-0 flex-1 basis-56 items-center gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <Input name="name" defaultValue={a.name} maxLength={60} required aria-label={`Name der Art ${a.name}`} />
                  <SubmitButton variant="outline" size="sm" className="min-h-8" pendingText="Speichert…">
                    Umbenennen
                  </SubmitButton>
                </form>
                <form action={mitgliedsartLoeschen}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmSubmitButton variant="outline" size="sm" className="min-h-8 text-destructive" confirmText={`Art „${a.name}“ löschen? Die Mitglieder bleiben bestehen, ihre Art ist danach leer.`}>
                    Löschen
                  </ConfirmSubmitButton>
                </form>
              </div>
            ))}
            <form action={mitgliedsartAnlegen} className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
                <label htmlFor="neue-art" className="text-sm font-medium">
                  Neue Art
                </label>
                <Input id="neue-art" name="name" maxLength={60} required placeholder="z.B. Fördermitglied" />
              </div>
              <SubmitButton variant="secondary" className="w-full sm:w-auto" pendingText="Legt an…">
                Hinzufügen
              </SubmitButton>
            </form>
            {fehlendeStandardArten(arten).length > 0 && (
              <form action={standardArtenAnlegen} className="flex flex-col gap-2">
                <p className="text-muted-foreground">Vorschläge: {fehlendeStandardArten(arten).join(", ")}.</p>
                <SubmitButton variant="outline" className="w-full sm:w-auto" pendingText="Legt an…">
                  Übliche Arten anlegen
                </SubmitButton>
              </form>
            )}
          </div>
        </details>
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
        {arten.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="artfilter" className="text-sm font-medium">
              Art
            </label>
            <select id="artfilter" name="art" defaultValue={art} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30">
              <option value="">Alle</option>
              <option value="ohne">Ohne Angabe</option>
              {arten.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {(mannschaften.length > 0 || alle.length > 0) && (
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
              <option value="ohne">Ohne Mannschaft</option>
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
                  {m.artId && artName.get(m.artId) && <Badge variant="outline">{artName.get(m.artId)}</Badge>}
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
                        <MitgliedFormular action={mitgliedAendern} werte={m} arten={arten} absenden="Änderungen speichern" idPraefix={`e-${m.id}`} />
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
