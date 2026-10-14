import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Unterbereich } from "@/components/einstellungs-bereich";
import { bedarfsText, geltungsText, MAX_BEDARF } from "@/lib/eigene-dienste";
import type { DienstArtMitDetails } from "@/lib/eigene-dienste-daten";
import {
  dienstArtAktivSetzen,
  dienstArtLoeschen,
  dienstArtSpeichern,
  festenDienstSpeichern,
} from "@/app/admin/(dashboard)/einstellungen/eigene-dienste-actions";

// Einstellungen → "Dienste": EINE Liste für feste (Ordner, Kioskdienst, Kassierer, Zeitnehmer/Sekretär) und eigene Dienste (Fahrer,
// Kuchen, ...), jeweils mit derselben Bearbeitung: Bedarf je Veranstaltung (0 = dort nicht gebraucht) und Mannschaften.
// Feste Dienste speichern in vereine.*Bedarf und mannschaft.*BedarfDeaktiviert (dieselben Werte wie auf den Wart-Seiten),
// eigene in dienst_art. Bewusst ohne Client-JS (natives <details>, Radio + Checkboxen), wie der Rest der Einstellungsseite.

export type MannschaftsOption = { id: string; label: string };

export type FesterDienst = {
  rolle: "ordner" | "kioskdienst" | "kassierer" | "zeitnehmer";
  name: string;
  bedarf: { heim: number; freundschaft: number; turnier: number };
  // null = alle Mannschaften; sonst die Mannschaften, für die der Dienst NICHT abgeschaltet ist
  nurMannschaften: string[] | null;
};

const FESTER_HINWEIS: Record<FesterDienst["rolle"], string> = {
  ordner: "Einteilung auf der Seite Ordnerwart.",
  kioskdienst: "Einteilung auf der Seite Ordnerwart.",
  kassierer: "Einteilung auf der Seite Ordnerwart.",
  zeitnehmer: "Zahl = Personen insgesamt (z.B. 2 = ein Zeitnehmer und ein Sekretär). Einteilung auf der Seite Zeitnehmerwart.",
};

export function DiensteEinstellungen({
  feste,
  arten,
  mannschaften,
  eingeteilt,
  schreibzugriff,
}: {
  feste: FesterDienst[];
  arten: DienstArtMitDetails[];
  mannschaften: MannschaftsOption[];
  // dienstArtId -> Zahl der Einteilungen (Löschen nur bei 0)
  eingeteilt: Map<string, number>;
  schreibzugriff: boolean;
}) {
  const namen = new Map(mannschaften.map((m) => [m.id, m.label]));
  return (
    <div className="flex flex-col gap-1">
      {feste.map((f) => (
        <Unterbereich
          key={f.rolle}
          titel={f.name}
          kurz={bedarfsText(
            [
              ["Heim", f.bedarf.heim],
              ["Freundschaft", f.bedarf.freundschaft],
              ["Turnier", f.bedarf.turnier],
            ],
            f.nurMannschaften ? f.nurMannschaften.map((id) => namen.get(id) ?? "").filter(Boolean) : null
          )}
        >
          <form action={festenDienstSpeichern} className="flex flex-col gap-4">
            <fieldset disabled={!schreibzugriff} className="flex flex-col gap-4">
              <input type="hidden" name="rolle" value={f.rolle} />
              <BedarfFelder
                praefix={f.rolle}
                werte={{ heim: f.bedarf.heim, auswaerts: null, freundschaft: f.bedarf.freundschaft, turnier: f.bedarf.turnier }}
              />
              <p className="text-xs text-muted-foreground">{FESTER_HINWEIS[f.rolle]}</p>
              <MannschaftsAuswahl praefix={f.rolle} mannschaften={mannschaften} nur={f.nurMannschaften} />
              {schreibzugriff && (
                <SubmitButton className="self-start" pendingText="Wird gespeichert…">
                  Speichern
                </SubmitButton>
              )}
            </fieldset>
          </form>
        </Unterbereich>
      ))}

      <span id="eigene-dienste" className="scroll-mt-24" />
      {arten.map((d) => (
        <Unterbereich
          key={d.id}
          titel={d.aktiv ? `${d.name} (eigener Dienst)` : `${d.name} (eigener Dienst, deaktiviert)`}
          kurz={geltungsText(d, namen)}
        >
          <EigenerDienstFormular dienst={d} mannschaften={mannschaften} schreibzugriff={schreibzugriff} />
          {schreibzugriff && (
            <div className="flex flex-wrap gap-2">
              <form action={dienstArtAktivSetzen}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="aktiv" value={d.aktiv ? "false" : "true"} />
                <SubmitButton variant="outline" size="sm" pendingText="Wird gespeichert…">
                  {d.aktiv ? "Deaktivieren" : "Wieder aktivieren"}
                </SubmitButton>
              </form>
              {(eingeteilt.get(d.id) ?? 0) === 0 ? (
                <form action={dienstArtLoeschen}>
                  <input type="hidden" name="id" value={d.id} />
                  <ConfirmSubmitButton variant="ghost" size="sm" confirmText={`Dienst „${d.name}“ wirklich löschen?`}>
                    Löschen
                  </ConfirmSubmitButton>
                </form>
              ) : (
                <p className="self-center text-xs text-muted-foreground">
                  {eingeteilt.get(d.id)} Einteilung(en) vorhanden, deshalb nur deaktivierbar.
                </p>
              )}
            </div>
          )}
        </Unterbereich>
      ))}
      {schreibzugriff && (
        <Unterbereich titel="+ Eigenen Dienst anlegen" kurz="z.B. Fahrer, Kuchen, Aufbau, Abbau">
          <EigenerDienstFormular mannschaften={mannschaften} schreibzugriff />
        </Unterbereich>
      )}
    </div>
  );
}

// Bedarf je Veranstaltung, für feste und eigene Dienste gleich. auswaerts = null: für diesen Dienst nicht möglich (feste Dienste
// gibt es nur bei eigenen Veranstaltungen).
function BedarfFelder({
  praefix,
  werte,
}: {
  praefix: string;
  werte: { heim: number; auswaerts: number | null; freundschaft: number; turnier: number };
}) {
  const spalten: [keyof typeof werte, string, string][] = [
    ["heim", "bedarfHeim", "Heimspiel"],
    ["auswaerts", "bedarfAuswaerts", "Auswärts"],
    ["freundschaft", "bedarfFreundschaft", "Freund­schaft"],
    ["turnier", "bedarfTurnier", "Turnier"],
  ];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">Personen je Termin</legend>
      {/* items-end: zweizeilige Beschriftungen (z.B. „Freund-schaft“) verschieben die Eingabefelder nicht. */}
      <div className="grid grid-cols-4 items-end gap-2">
        {spalten.map(([schluessel, name, titel]) => {
          const wert = werte[schluessel];
          const id = `${name}-${praefix}`;
          return (
            <div key={name} className="flex flex-col gap-1">
              <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
                {titel}
              </Label>
              {wert === null ? (
                <Badge variant="outline" className="h-9 w-full justify-center text-muted-foreground" title="Nur für eigene Dienste">
                  –
                </Badge>
              ) : (
                <Input id={id} name={name} type="number" min="0" max={MAX_BEDARF} step="1" required defaultValue={wert} className="text-center" />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">0 = bei dieser Veranstaltung nicht gebraucht.</p>
    </fieldset>
  );
}

function MannschaftsAuswahl({ praefix, mannschaften, nur }: { praefix: string; mannschaften: MannschaftsOption[]; nur: string[] | null }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">Mannschaften</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name="mannschaftsModus" value="alle" defaultChecked={!nur} />
        Alle Mannschaften
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name="mannschaftsModus" value="auswahl" defaultChecked={!!nur} />
        Nur diese Mannschaften:
      </label>
      {mannschaften.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Mannschaften angelegt.</p>
      ) : (
        <div className="grid gap-x-4 sm:grid-cols-2">
          {mannschaften.map((m) => (
            <label key={m.id} htmlFor={`m-${praefix}-${m.id}`} className="flex min-h-11 items-center gap-2 text-sm">
              <input id={`m-${praefix}-${m.id}`} type="checkbox" name="mannschaftIds" value={m.id} defaultChecked={!!nur?.includes(m.id)} />
              {m.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function EigenerDienstFormular({
  dienst,
  mannschaften,
  schreibzugriff,
}: {
  dienst?: DienstArtMitDetails;
  mannschaften: MannschaftsOption[];
  schreibzugriff: boolean;
}) {
  const p = dienst?.id ?? "neu";
  return (
    <form action={dienstArtSpeichern} className="flex flex-col gap-4">
      <fieldset disabled={!schreibzugriff} className="flex flex-col gap-4">
        {dienst && <input type="hidden" name="id" value={dienst.id} />}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${p}`}>Name</Label>
          <Input id={`name-${p}`} name="name" required maxLength={40} defaultValue={dienst?.name ?? ""} placeholder="z.B. Fahrer" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`beschreibung-${p}`}>Hinweis für die Helfer (optional)</Label>
          <Input
            id={`beschreibung-${p}`}
            name="beschreibung"
            maxLength={300}
            defaultValue={dienst?.beschreibung ?? ""}
            placeholder="z.B. Treffpunkt 30 Minuten vor Abfahrt an der Halle"
          />
        </div>
        <BedarfFelder
          praefix={p}
          werte={{
            heim: dienst?.bedarfHeim ?? 1,
            auswaerts: dienst?.bedarfAuswaerts ?? 0,
            freundschaft: dienst?.bedarfFreundschaft ?? 0,
            turnier: dienst?.bedarfTurnier ?? 0,
          }}
        />
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" name="fahrgemeinschaft" defaultChecked={dienst?.fahrgemeinschaft ?? false} className="mt-1" />
          <span>
            Fahrgemeinschaft (z.B. Fahrer)
            <span className="block text-xs text-muted-foreground">
              Fahrer geben beim Eintragen ihre freien Plätze an. Mitfahrer (z.B. Kinder) tragen sich über den Eintragungslink selbst ein, der
              Fahrer bekommt eine Mail. Namen der Mitfahrer sind nie öffentlich.
            </span>
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          Auswärtsspiele (z.B. für Fahrer) erscheinen automatisch aus dem Spielplan im Kalender (mit Auto-Symbol) und auf der
          Dienstwart-Seite, sobald ein Dienst dort Bedarf hat (oder ein Trainer der Mannschaft hinterlegt ist). Wird ein Auswärtsspiel verlegt oder abgesagt, entfallen die Einteilungen
          und die Eingeteilten bekommen eine Mail.
        </p>
        <MannschaftsAuswahl
          praefix={p}
          mannschaften={mannschaften}
          nur={dienst?.nurAusgewaehlteMannschaften ? dienst.mannschaftIds : null}
        />
        {schreibzugriff && (
          <SubmitButton className="self-start" pendingText="Wird gespeichert…">
            {dienst ? "Speichern" : "Dienst anlegen"}
          </SubmitButton>
        )}
      </fieldset>
    </form>
  );
}
