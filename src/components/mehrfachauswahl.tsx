"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";

export type EintragbarerTermin = {
  id: string;
  zeit: string;
  // Kalendertag (Europe/Berlin, siehe tagKey in lib/kalender.ts) — dient nur
  // dem Gruppieren hier (Vergleich auf Gleichheit), nicht der Anzeige.
  tag: string;
  tagLabel: string;
  typLabel: string;
  ort: string | null;
  beschreibung: string | null;
  vollstaendig: boolean;
  eintragbar: boolean;
  // Werte aus rolleOptionen, für die bei DIESEM Termin noch Bedarf besteht
  // (siehe offeneRollen-Berechnung in den beiden page.tsx) — schränkt unten
  // die Rollen-Auswahl auf die Schnittmenge über alle ausgewählten Termine
  // ein, damit niemand eine für die aktuelle Auswahl bereits volle Rolle
  // wählen kann.
  offeneRollen: string[];
  // Rollen, für die der Verein bei DIESEM Termin überhaupt Bedarf hat (auch schon besetzte) — bestimmt, in welcher Gruppe der Termin erscheint.
  rollenMitBedarf: string[];
  zuordnungen: { id: string; label: string }[];
};

// Auswahl-Gruppe der Rollen ("Zeitnehmer / Sekretär", "Ordner", ...): die Person wählt oben die Gruppe, bei mehreren Rollen darin (Zeitnehmer
// und Sekretär sind im Kern dasselbe, nur eine andere Aufgabe) die konkrete Aufgabe je Termin.
export type RollenGruppe = { id: string; label: string; rollen: { value: string; label: string }[] };

export type MehrfachEintragErgebnis = {
  eingetragen: number;
  gesamt: number;
  // Mehrere Fehler mit " | " getrennt, analog zu den Import-/nuLiga-
  // Ergebnissen in admin/funktionstraeger und admin/einstellungen.
  fehler: string | null;
  // Nicht blockierende Hinweise (z.B. Ordner-Doppelrolle über ORDNER_ROLLEN
  // hinweg, siehe pruefeKeineOrdnerDoppelrolle in lib/ordnerwart.ts) —
  // anders als fehler kein abgelehnter Termin, nur ein Hinweis zu einem
  // trotzdem erfolgreich eingetragenen. Ebenfalls mit " | " getrennt.
  warnung?: string | null;
};

// Ablauf in zwei Schritten (Handy zuerst): 1. EINMAL oben angeben, wer man ist (Name, optional E-Mail) und wobei man helfen möchte (Gruppe),
// 2. beliebig viele Termine antippen; gibt es in der Gruppe mehrere Aufgaben (Zeitnehmer/Sekretär), wählt man sie je Termin. Unten klebt nur eine
// schmale Leiste mit Anzahl und Eintragen-Button. Genutzt von /eintragen/[token] (alle von den Warten freigeschalteten Gruppen).
//
// Absenden: pro gewähltem Termin ein Feld "auswahl" = "terminId|rolle". Drei Varianten, gesteuert über eingeloggtAls/zeigeEmailFeld: anonym per
// Name, anonym per Name+E-Mail (legt bei Bedarf ein zunächst inaktives Konto an), oder mit erkannter Session (Name/E-Mail ausgeblendet).
export function TerminMehrfachAuswahl({
  token,
  termine,
  rollenGruppen,
  submitAction,
  eingeloggtAls,
  zeigeEmailFeld,
}: {
  token: string;
  termine: EintragbarerTermin[];
  rollenGruppen: RollenGruppe[];
  submitAction: (formData: FormData) => Promise<MehrfachEintragErgebnis>;
  // Gesetzt, wenn die Seite eine passende, eingeloggte Session erkannt hat — blendet Name/E-Mail komplett aus.
  eingeloggtAls?: string;
  // Zusätzliches, OPTIONALES E-Mail-Feld im anonymen Formular — wird eine E-Mail angegeben, legt die Aktion dafür direkt ein Konto
  // (+ zunächst inaktive Rolle, bis ein Wart sie freischaltet) an. Nur relevant, wenn eingeloggtAls NICHT gesetzt ist.
  zeigeEmailFeld?: boolean;
}) {
  // terminId -> gewählte Rolle (Aufgabe)
  const [auswahl, setAuswahl] = useState<Map<string, string>>(new Map());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Nur eine Gruppe zur Wahl: gleich gewählt. Sonst muss man sie bewusst wählen (nicht raten, welche gemeint ist).
  const [gruppeId, setGruppeId] = useState(rollenGruppen.length === 1 ? rollenGruppen[0].id : "");
  const gruppe = rollenGruppen.find((g) => g.id === gruppeId);
  const gruppenRollen = gruppe ? gruppe.rollen.map((r) => r.value) : [];
  const rollenLabel = (rolle: string) => gruppe?.rollen.find((r) => r.value === rolle)?.label ?? rolle;
  // "Offene zuerst" zeigt die Termine mit noch freier Besetzung oben (stabil, innerhalb der Gruppen weiter nach Datum); dann gibt es keine
  // Tages-Überschriften (Reihenfolge nicht mehr chronologisch, das Datum steht in jeder Karte).
  const [sortierung, setSortierung] = useState<"datum" | "offen">("offen");

  // Nur Termine, bei denen die gewählte Gruppe überhaupt gebraucht wird; wählbar, wenn dort noch ein Platz frei ist.
  const sichtbar = termine.filter((t) => t.rollenMitBedarf.some((r) => gruppenRollen.includes(r)));
  const offeneRollenIn = (t: EintragbarerTermin) => gruppenRollen.filter((r) => t.offeneRollen.includes(r));
  const waehlbar = (t: EintragbarerTermin) => offeneRollenIn(t).length > 0;
  const anzeigeTermine = sortierung === "offen" ? [...sichtbar].sort((a, b) => Number(!waehlbar(a)) - Number(!waehlbar(b))) : sichtbar;
  const mehrtaegig = sortierung === "datum" && new Set(sichtbar.map((t) => t.tag)).size > 1;

  const [status, submitActionState] = useActionState(
    (_bisher: MehrfachEintragErgebnis | null, formData: FormData) => submitAction(formData),
    null
  );
  // State während des Renderns anpassen statt in einem Effect (siehe https://react.dev/learn/you-might-not-need-an-effect). Die Auswahl wird
  // nur zurückgesetzt, wenn mindestens ein Termin tatsächlich eingetragen wurde, nicht bei einem kompletten Fehlschlag.
  const [verarbeiteterStatus, setVerarbeiteterStatus] = useState(status);
  if (status !== verarbeiteterStatus) {
    setVerarbeiteterStatus(status);
    if (status && status.eingetragen > 0) setAuswahl(new Map());
  }

  function waehleGruppe(neu: string) {
    setGruppeId(neu);
    setAuswahl(new Map()); // andere Gruppe = andere Termine/Aufgaben
  }

  // Rückmeldung nach dem Absenden (Erfolg ODER Fehler) in den sichtbaren Bereich holen — die Leiste klebt unten, die Meldung steht oben.
  const rueckmeldungRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status) rueckmeldungRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [status]);

  function toggle(t: EintragbarerTermin) {
    setAuswahl((bisher) => {
      const naechste = new Map(bisher);
      if (naechste.has(t.id)) naechste.delete(t.id);
      else naechste.set(t.id, offeneRollenIn(t)[0]); // Aufgabe vorbelegt (die erste freie), je Karte änderbar
      return naechste;
    });
  }
  function setzeAufgabe(terminId: string, rolle: string) {
    setAuswahl((bisher) => new Map(bisher).set(terminId, rolle));
  }

  // "2× Zeitnehmer, 1× Sekretär": macht die Aufgabe je Termin schon vor dem Absenden sichtbar (Zeitnehmer und Sekretär bleiben getrennte Aufgaben).
  const aufgabenText = (wahl: Map<string, string>) => {
    const zaehler = new Map<string, number>();
    for (const rolle of wahl.values()) zaehler.set(rolle, (zaehler.get(rolle) ?? 0) + 1);
    return [...zaehler].map(([rolle, n]) => `${n}× ${rollenLabel(rolle)}`).join(", ");
  };
  // Beim Absenden gemerkt, damit die Erfolgsmeldung nennt, als WAS man sich eingetragen hat (die Auswahl ist danach geleert).
  const [zuletztEingetragen, setZuletztEingetragen] = useState("");

  // Was noch fehlt, bevor eingetragen werden kann (Hinweis in der Leiste statt eines toten Buttons).
  const fehlt = !gruppe ? "Bitte oben auswählen, wobei ihr helfen möchtet." : !eingeloggtAls && !name.trim() ? "Bitte oben euren Namen eintragen." : null;

  return (
    <form
      action={(formData) => {
        setZuletztEingetragen(aufgabenText(auswahl));
        return submitActionState(formData);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="token" value={token} />
      {[...auswahl].map(([id, rolle]) => (
        <input key={id} type="hidden" name="auswahl" value={`${id}|${rolle}`} />
      ))}

      <div ref={rueckmeldungRef} className="flex scroll-mt-4 flex-col gap-3 empty:hidden">
        {status && status.eingetragen > 0 && (
          <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2Icon />
            <AlertDescription className="text-base font-medium text-emerald-800 dark:text-emerald-300">
              <p>
                {status.eingetragen === status.gesamt
                  ? status.gesamt === 1
                    ? "Erledigt: Der Termin ist eingetragen."
                    : `Erledigt: Alle ${status.gesamt} Termine sind eingetragen.`
                  : `${status.eingetragen} von ${status.gesamt} Terminen eingetragen.`}{" "}
                {zuletztEingetragen ? `Eingetragen als: ${zuletztEingetragen}. ` : ""}Danke! Die Einträge stehen jetzt an den Terminen.
              </p>
              {!eingeloggtAls && !email.trim() && (
                <p className="mt-1 font-normal">
                  Tipp: Mit einer E-Mail-Adresse bekommt ihr beim nächsten Mal einen eigenen Zugang — dann seht ihr eure Einsätze im Kalender und werdet
                  erinnert.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {// Außerhalb der Auswahl, da diese nach einem Teilerfolg zurückgesetzt wird — die Fehlermeldung zu den restlichen,
        // fehlgeschlagenen Terminen soll trotzdem sichtbar bleiben.
        status?.fehler && (
          <Alert variant="destructive">
            <AlertDescription className="text-base">
              {status.fehler.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
        {status?.warnung && (
          <Alert>
            <AlertDescription className="text-base">
              {status.warnung.split(" | ").map((w) => (
                <p key={w}>{w}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Schritt 1: wer und wobei — einmal für alle Termine */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">1. Wer trägt sich ein?</p>
          {eingeloggtAls ? (
            <p className="text-base">
              Eintragen als <strong>{eingeloggtAls}</strong>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eintragen-name" className="text-base">
                  Name
                </Label>
                <Input
                  id="eintragen-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Vor- und Nachname"
                  autoComplete="name"
                  required
                  className="h-12 px-3"
                />
              </div>
              {zeigeEmailFeld && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eintragen-email" className="text-base">
                    E-Mail (empfohlen)
                  </Label>
                  <Input
                    id="eintragen-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@verein.de"
                    autoComplete="email"
                    className="h-12 px-3"
                  />
                  <p className="text-sm text-muted-foreground">Damit bekommt ihr einen eigenen Zugang: Einsätze im Kalender, Erinnerungen, nächstes Mal ohne Tippen.</p>
                </div>
              )}
            </div>
          )}
          {rollenGruppen.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-medium" id="eintragen-gruppe-label">
                Wobei möchtet ihr helfen?
              </span>
              <div role="radiogroup" aria-labelledby="eintragen-gruppe-label" className="flex flex-wrap gap-2">
                {rollenGruppen.map((g) => (
                  <Button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={gruppeId === g.id}
                    variant={gruppeId === g.id ? "default" : "outline"}
                    className="h-12 px-5 text-base"
                    onClick={() => waehleGruppe(g.id)}
                  >
                    {g.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schritt 2: Termine antippen */}
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold">2. Termine antippen</p>
        {!gruppe ? (
          <p className="-mt-2 text-base text-muted-foreground">Wählt zuerst oben aus, wobei ihr helfen möchtet.</p>
        ) : sichtbar.length === 0 ? (
          <p className="-mt-2 text-base text-muted-foreground">Zurzeit gibt es keine anstehenden Termine mit Bedarf an „{gruppe.label}“.</p>
        ) : (
          <>
            <p className="-mt-2 text-base text-muted-foreground">
              Tippt die Termine an, bei denen ihr helft — mehrere gleichzeitig sind möglich.
              {gruppe.rollen.length > 1 && ` Die Aufgabe (${gruppe.rollen.map((r) => r.label).join(" oder ")}) wählt ihr je Termin.`}
            </p>

            <div className="flex w-fit gap-1 rounded-lg border bg-muted p-1">
              <Button
                type="button"
                variant={sortierung === "datum" ? "secondary" : "ghost"}
                className="h-11 px-4 text-base"
                onClick={() => setSortierung("datum")}
              >
                Nach Datum
              </Button>
              <Button
                type="button"
                variant={sortierung === "offen" ? "secondary" : "ghost"}
                className="h-11 px-4 text-base"
                onClick={() => setSortierung("offen")}
              >
                Offene zuerst
              </Button>
            </div>

            {anzeigeTermine.map((t, i) => {
              const frei = waehlbar(t);
              const gewaehlt = auswahl.has(t.id);
              const offene = offeneRollenIn(t);
              return (
                <div key={t.id} className="flex flex-col gap-3">
                  {mehrtaegig && (i === 0 || anzeigeTermine[i - 1].tag !== t.tag) && (
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.tagLabel}</p>
                  )}
                  <Card
                    className={cn(
                      "min-w-0",
                      // Ganze Karte als Tippfläche statt nur der Checkbox — auf dem Handy deutlich leichter zu treffen.
                      frei && "cursor-pointer select-none transition active:scale-[0.99]",
                      !frei && "opacity-60",
                      gewaehlt && "bg-primary/5 ring-2 ring-primary"
                    )}
                    onClick={frei ? () => toggle(t) : undefined}
                  >
                    <CardContent className="flex flex-col gap-3 text-base">
                      <div className="flex flex-wrap items-center gap-2">
                        {frei && (
                          <input
                            type="checkbox"
                            aria-label={`${t.zeit} auswählen`}
                            className="size-6 shrink-0 accent-primary"
                            checked={gewaehlt}
                            onChange={() => toggle(t)}
                            // Klick nicht zusätzlich zur Karte durchbubbeln lassen, sonst würde er den Zustand zweimal umschalten.
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span className="text-lg font-semibold">{t.zeit}</span>
                        <Badge variant="outline">{t.typLabel}</Badge>
                        <Badge variant={t.vollstaendig ? "secondary" : "outline"}>
                          {t.vollstaendig ? "Besetzung vollständig" : "Besetzung offen"}
                        </Badge>
                        {t.ort && <span className="text-muted-foreground">{t.ort}</span>}
                      </div>
                      {t.beschreibung && <p className="text-muted-foreground">{t.beschreibung}</p>}
                      {!frei && <p className="text-sm text-muted-foreground">Als {gruppe.label} schon besetzt.</p>}
                      {gewaehlt && offene.length > 1 && (
                        // Mehrere freie Aufgaben (Zeitnehmer UND Sekretär): je Termin wählen, vorbelegt ist die erste.
                        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-sm font-medium">Aufgabe:</span>
                          {offene.map((r) => (
                            <Button
                              key={r}
                              type="button"
                              role="radio"
                              aria-checked={auswahl.get(t.id) === r}
                              variant={auswahl.get(t.id) === r ? "default" : "outline"}
                              className="h-11 px-4 text-base"
                              onClick={() => setzeAufgabe(t.id, r)}
                            >
                              {rollenLabel(r)}
                            </Button>
                          ))}
                        </div>
                      )}
                      {gewaehlt && offene.length === 1 && gruppe.rollen.length > 1 && (
                        <p className="text-sm font-medium">Aufgabe: {rollenLabel(offene[0])} (die andere ist schon besetzt)</p>
                      )}
                      {(t.zuordnungen.length > 0 || offene.length > 0) && (
                        <div className="flex flex-wrap gap-1">
                          {t.zuordnungen.map((z) => (
                            <Badge key={z.id} variant="secondary">
                              {z.label}
                            </Badge>
                          ))}
                          {offene.map((r) => (
                            <Badge key={r} variant="outline">
                              {rollenLabel(r)}: offen
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </>
        )}
      </div>

      {auswahl.size > 0 && (
        // Schmale Leiste am unteren Rand: bleibt beim Scrollen sichtbar, verdeckt aber kaum etwas (nur Anzahl + Button).
        <div className="sticky bottom-0 z-20 -mx-2 flex flex-col gap-2 rounded-t-xl border bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-6px_16px_rgba(0,0,0,0.12)]">
          {fehlt && <p className="text-sm font-medium text-destructive">{fehlt}</p>}
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-base font-semibold">
              {auswahl.size} {auswahl.size === 1 ? "Termin" : "Termine"}
              {gruppe && gruppe.rollen.length > 1 && (
                <span className="block text-sm font-normal text-muted-foreground">{aufgabenText(auswahl)}</span>
              )}
            </span>
            <Button type="button" variant="ghost" className="h-12 px-3 text-base" onClick={() => setAuswahl(new Map())}>
              Leeren
            </Button>
            {fehlt ? (
              // Kein SubmitButton: ein übergebenes disabled würde dessen Sperre während des Absendens überschreiben.
              <Button type="button" disabled className="h-12 px-6 text-base">
                Eintragen
              </Button>
            ) : (
              <SubmitButton className="h-12 px-6 text-base" pendingText="Wird eingetragen…">
                Eintragen
              </SubmitButton>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
