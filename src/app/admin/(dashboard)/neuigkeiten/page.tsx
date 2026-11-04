import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { ladeNeuigkeitenAdmin, neuigkeitenAktiv } from "@/lib/neuigkeiten-daten";
import { ladeVereinsMannschaften } from "@/lib/mitglied-mannschaften-daten";
import { NEUIGKEIT_TEXT_MAX, NEUIGKEIT_TITEL_MAX } from "@/lib/neuigkeiten";
import { formatDatum } from "@/lib/format";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { neuigkeitLoeschen, neuigkeitSpeichern, neuigkeitZurueckziehen } from "./actions";

const selectKlasse = "h-11 w-full rounded-lg border bg-background px-3 text-sm";
const textKlasse = "min-h-32 w-full rounded-lg border bg-background px-3 py-2 text-sm";

export default async function NeuigkeitenSeite({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string; n?: string }> }) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { ok, fehler, n } = await searchParams;

  if (!(await neuigkeitenAktiv(vereinId))) {
    return (
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <h1 className="font-heading text-2xl font-semibold">Neuigkeiten</h1>
        <Card>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>Die Neuigkeiten sind für euren Verein noch nicht eingeschaltet. Mit dem Schalter erscheinen sie als eigener Bereich in der öffentlichen App und als Feed für die Homepage.</p>
            <Link href="/admin/einstellungen#neuigkeiten" className="font-medium underline">
              Einstellungen → Neuigkeiten
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [liste, mannschaften] = await Promise.all([ladeNeuigkeitenAdmin(vereinId), ladeVereinsMannschaften(vereinId)]);
  const schreibend = session.user.istAdmin;
  const mannschaftsName = new Map(mannschaften.map((m) => [m.id, m.name]));

  const formular = (e?: (typeof liste)[number]) => (
    <form action={neuigkeitSpeichern} className="mt-3 flex flex-col gap-3">
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`titel-${e?.id ?? "neu"}`}>Titel</Label>
        <Input id={`titel-${e?.id ?? "neu"}`} name="titel" maxLength={NEUIGKEIT_TITEL_MAX} required defaultValue={e?.titel ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`text-${e?.id ?? "neu"}`}>Text (Leerzeile = neuer Absatz, kein HTML)</Label>
        <textarea id={`text-${e?.id ?? "neu"}`} name="text" maxLength={NEUIGKEIT_TEXT_MAX} required defaultValue={e?.text ?? ""} className={textKlasse} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`mannschaft-${e?.id ?? "neu"}`}>Mannschaft (optional)</Label>
        <select id={`mannschaft-${e?.id ?? "neu"}`} name="ligaMannschaftId" defaultValue={e?.ligaMannschaftId ?? ""} className={selectKlasse}>
          <option value="">Ganzer Verein</option>
          {mannschaften.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton name="aktion" value="veroeffentlichen" pendingText="Speichert…">
          {e?.veroeffentlichtAm ? "Speichern" : "Veröffentlichen"}
        </SubmitButton>
        {!e?.veroeffentlichtAm && (
          <SubmitButton name="aktion" value="entwurf" variant="outline" pendingText="Speichert…">
            Als Entwurf speichern
          </SubmitButton>
        )}
      </div>
    </form>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="font-heading text-2xl font-semibold">Neuigkeiten</h1>
          <HilfeHinweis anker="neuigkeiten" />
        </div>
        <p className="text-sm text-muted-foreground">
          Berichte und Meldungen eures Vereins. Veröffentlichte erscheinen in der öffentlichen App und im Feed (<code>/verein/…/feed.xml</code>) für eure Homepage; Entwürfe sieht nur ihr.
        </p>
      </div>

      {ok && <p className="rounded-md border border-green-600/40 bg-green-600/10 p-2 text-sm">{ok}</p>}
      {fehler && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">{fehler}</p>}

      {schreibend && (
        <Card>
          <CardHeader>
            <CardTitle>Neue Neuigkeit</CardTitle>
            <CardDescription>Nur Text, ohne Bilder. Bitte keine Namen von Minderjährigen ohne Einwilligung nennen.</CardDescription>
          </CardHeader>
          <CardContent>{formular()}</CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {liste.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Neuigkeiten.</p>}
        {liste.map((e) => (
          <details key={e.id} id={`n-${e.id}`} className="rounded-lg border bg-card px-3 py-2" open={n === e.id}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-medium">
              <span className="min-w-0 [overflow-wrap:anywhere]">{e.titel}</span>
              {e.veroeffentlichtAm ? <Badge>Veröffentlicht {formatDatum(e.veroeffentlichtAm)}</Badge> : <Badge variant="secondary">Entwurf</Badge>}
            </summary>
            {e.ligaMannschaftId && <p className="mt-2 text-xs text-muted-foreground">Mannschaft: {mannschaftsName.get(e.ligaMannschaftId) ?? "unbekannt"}</p>}
            {schreibend ? (
              <>
                {formular(e)}
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                  {e.veroeffentlichtAm && (
                    <form action={neuigkeitZurueckziehen}>
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton size="sm" variant="outline" pendingText="…">
                        Zurückziehen
                      </SubmitButton>
                    </form>
                  )}
                  <form action={neuigkeitLoeschen}>
                    <input type="hidden" name="id" value={e.id} />
                    <ConfirmSubmitButton size="sm" variant="ghost" pendingText="…" confirmText="Diese Neuigkeit endgültig löschen?">
                      Löschen
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </>
            ) : (
              <p className="mt-2 whitespace-pre-line text-sm">{e.text}</p>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
