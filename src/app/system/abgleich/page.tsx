import { requireSystemAdmin } from "@/lib/session";
import { berechneHallenplanAbgleich } from "@/lib/hallenplan-abgleich-laden";
import { formatDatumZeit } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { handlungsbedarf } from "@/lib/abgleich-handlungen";
import { holeQuellenKonflikte } from "@/lib/quellen-konflikte";
import { hallenplanImportSchalten, ortBestaetigen, ortUebernehmen, ansetzungVergleichen, hallenplanVerknuepfen, ligaUebernahmeSchalten } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Der Ansetzungs-Vergleich lädt Gruppenseiten von nuLiga (mit Mindestabstand) — braucht Zeit.
export const maxDuration = 60;

const STATUS_LABEL = {
  unklar: "Unklar",
  mehrdeutig: "Mehrdeutig",
  kein_treffer: "Kein Treffer",
  sicher: "Sicher",
} as const;

export default async function AbgleichPage({
  searchParams,
}: {
  searchParams: Promise<{ verein?: string; neu?: string; schon?: string; dup?: string; zv?: string; zn?: string; ueb?: string; uebdup?: string; uebdupd?: string; uebzeit?: string; av?: string; avg?: string; avgl?: string; avv?: string; avh?: string; avo?: string; avl?: string; avf?: string; avb?: string; avq?: string }>;
}) {
  await requireSystemAdmin();
  const ergebnisInfo = await searchParams;
  const [vereine, quellenKonflikte] = await Promise.all([berechneHallenplanAbgleich(), holeQuellenKonflikte()]);
  const mitTerminen = vereine.filter((v) => v.termineGesamt > 0 || v.hatLigaVerein);
  const neue = mitTerminen.filter((v) => v.hatLigaVerein && v.termineGesamt === 0);
  const pruefbar = mitTerminen.filter((v) => v.hatLigaVerein && v.termineGesamt > 0);
  const handlungen = handlungsbedarf;
  const zeitpunkt = new Date().getTime();
  const aktionen = pruefbar.filter((v) => handlungen(v).length > 0);
  const dienste = (zv?: string, zn?: string) =>
    ` Kontrolle Dienste: vorher ${zv}, nachher ${zn}${zv === zn ? " — unverändert." : " — ABWEICHUNG, bitte prüfen."}`;
  // Ergebnis der zuletzt ausgelösten Aktion (nur für den Verein, bei dem sie ausgelöst wurde)
  const aktionsErgebnis = (vereinId: string): string | null => {
    if (ergebnisInfo.verein !== vereinId) return null;
    if (ergebnisInfo.neu !== undefined)
      return `Verknüpft: ${ergebnisInfo.neu} neu, ${ergebnisInfo.schon} schon vorhanden${Number(ergebnisInfo.dup) > 0 ? `, ${ergebnisInfo.dup} wegen Duplikaten übersprungen` : ""}.${dienste(ergebnisInfo.zv, ergebnisInfo.zn)}`;
    if (ergebnisInfo.ueb !== undefined)
      return `Übernommen: ${ergebnisInfo.ueb} Termine angelegt${Number(ergebnisInfo.uebdup) > 0 ? `, ${ergebnisInfo.uebdup} leere Doppelgänger entfernt` : ""}${Number(ergebnisInfo.uebdupd) > 0 ? `, ${ergebnisInfo.uebdupd} Doppelgänger mit Diensten (bitte prüfen)` : ""}.${dienste(ergebnisInfo.zv, ergebnisInfo.zn)}`;
    if (ergebnisInfo.av === "1")
      return `Ansetzung verglichen${ergebnisInfo.avq === "handball_net" ? " (handball.net)" : ""}: ${ergebnisInfo.avg} Termine — gleich ${ergebnisInfo.avgl}, verschieden ${ergebnisInfo.avv}, nur im Hallenplan ${ergebnisInfo.avh}, nur öffentlich ${ergebnisInfo.avo}, beide ohne Ansetzung ${ergebnisInfo.avl}.`;
    return null;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Hallenplan-Abgleich</h1>
        <p className="text-sm text-muted-foreground">
          Umstellung vom Hallenplan-Import (Hallen-ID) auf die öffentlichen Liga-Daten. Oben steht nur, was bei
          einem Verein noch zu tun ist; darunter die Schalter je Verein. Abgeschlossenes wird nicht mehr angezeigt.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Handlungsbedarf</CardTitle>
          <CardDescription>
            {aktionen.length === 0
              ? "Alles erledigt — bei keinem Verein ist etwas zu tun."
              : `${aktionen.length} von ${pruefbar.length} Vereinen brauchen noch etwas.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <ul className="flex flex-col gap-1">
            {pruefbar.map((v) => {
              const offen = handlungen(v).length > 0;
              return (
                <li key={`status-${v.vereinId}`} id={`status-${v.vereinId}`} className="flex scroll-mt-20 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={offen ? "default" : "outline"}>{offen ? "Handlung nötig" : "Erledigt"}</Badge>
                  <span className="font-medium">{v.vereinName}</span>
                  <span className="text-xs text-muted-foreground">
                    {v.bereitsVerknuepft} von {v.termineGesamt} Terminen verknüpft · automatische Übernahme{" "}
                    {v.uebernahmeAktiv ? "an" : "aus"} · Hallenplan-Import {v.hallenplanAus ? "aus" : "an"}
                  </span>
                  </div>
                  {aktionsErgebnis(v.vereinId) && (
                    <p className="rounded-md border bg-muted/40 p-2 text-xs">{aktionsErgebnis(v.vereinId)}</p>
                  )}
                </li>
              );
            })}
          </ul>
          {aktionen.map((v) => (
            <div key={`aktion-${v.vereinId}`} className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="font-medium">{v.vereinName}</p>
              <ul className="list-disc space-y-1 pl-5">
                {handlungen(v).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {v.trockenlauf.ortFaelle.length > 0 && (
                <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 text-xs">
                  <p className="font-medium">Ort prüfen (Hallenplan ↔ öffentlich):</p>
                  {v.trockenlauf.ortFaelle.map((f) => (
                    <div key={f.terminId} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(f.start)}{" "}
                        {f.heim ?? "?"} – {f.gast ?? "?"}: Termin „{f.hallenplan}“, öffentlich „{f.oeffentlich}“
                      </span>
                      <div className="flex flex-wrap gap-2">
                      <form action={ortUebernehmen}>
                        <input type="hidden" name="vereinId" value={v.vereinId} />
                        <input type="hidden" name="terminId" value={f.terminId} />
                        <input type="hidden" name="ziel" value="status" />
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          pendingText="Speichert…"
                          confirmText={`Den Ort dieses Termins auf „${f.oeffentlich}“ ändern (bisher „${f.hallenplan}“)? Zeit und Dienste bleiben, die eingetragenen Personen bekommen die Mail „Termin geändert“.`}
                        >
                          Ort aus öffentlichen Daten übernehmen
                        </ConfirmSubmitButton>
                      </form>
                      <form action={ortBestaetigen}>
                        <input type="hidden" name="vereinId" value={v.vereinId} />
                        <input type="hidden" name="terminId" value={f.terminId} />
                        <input type="hidden" name="ziel" value="status" />
                        <ConfirmSubmitButton
                          size="sm"
                          variant="outline"
                          pendingText="Speichert…"
                          confirmText={`Ort geprüft: der Termin bleibt in „${f.hallenplan}“ (öffentlich steht „${f.oeffentlich}“)? Es wird nur die Prüfung vermerkt, am Termin ändert sich nichts. Ändert sich der öffentliche Hallenname später, wird es wieder gemeldet.`}
                        >
                          Ort geprüft, so lassen
                        </ConfirmSubmitButton>
                      </form>
                      </div>
                    </div>
                  ))}
                  <p className="text-muted-foreground">
                    Stimmt der öffentliche Ort, übernimm ihn per Knopf — dann verschwindet die Meldung von selbst.
                  </p>
                </div>
              )}
              {v.trockenlauf.pflichtOffenKuenftig > 0 && (
                <div className="rounded-md bg-muted/40 p-2 text-xs">
                  <p className="font-medium">Künftige Pflichtspiele ohne sichere Zuordnung:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {v.auffaellig
                      .filter((a) => a.pflichtspiel !== false && a.start.getTime() >= zeitpunkt)
                      .slice(0, 10)
                      .map((a, i) => (
                        <li key={i}>
                          {formatDatumZeit(a.start)} {a.heim} – {a.gast} ({STATUS_LABEL[a.status]}
                          {a.kandidaten.length > 0 ? `: ${a.kandidaten.join(" · ")}` : ""})
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {v.trockenlauf.doppelteKuenftig > 0 && (
                <div className="rounded-md bg-muted/40 p-2 text-xs">
                  <p className="font-medium">Doppelte Termine (mehrere Termine für dasselbe Spiel):</p>
                  <ul className="mt-1 list-disc pl-4">
                    {v.trockenlauf.doppelteBeispiele
                      .filter((d) => d.start.getTime() >= zeitpunkt)
                      .map((d, i) => (
                        <li key={i}>
                          {formatDatumZeit(d.start)} {d.heim ?? "?"} – {d.gast ?? "?"}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {v.trockenlauf.verknuepfbarOffen > 0 && (
                  <form action={hallenplanVerknuepfen}>
                    <input type="hidden" name="vereinId" value={v.vereinId} />
                    <input type="hidden" name="ziel" value="status" />
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      pendingText="Verknüpft…"
                      confirmText={`Termine von ${v.vereinName} mit den öffentlichen Spielen verknüpfen? Es wird nur ein Verweis je Termin gespeichert — Zeiten, Zuordnungen und Ansetzung bleiben unverändert, es wird nichts gelöscht.`}
                    >
                      Sicher zugeordnete Termine verknüpfen
                    </ConfirmSubmitButton>
                  </form>
                )}
                {!v.uebernahmeAktiv && (
                  <form action={ligaUebernahmeSchalten}>
                    <input type="hidden" name="vereinId" value={v.vereinId} />
                    <input type="hidden" name="aktiv" value="1" />
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      pendingText="Speichert…"
                      confirmText={`Für ${v.vereinName} die automatische Übernahme einschalten? Danach werden nach jedem Liga-Sync fehlende künftige Heimspiele angelegt, Verlegungen und Ergebnisse übernommen (bei einer Verlegung werden Betroffene benachrichtigt) und die Ansetzung aus den öffentlichen Seiten ergänzt.`}
                    >
                      Automatische Übernahme einschalten
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {neue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Neu eingerichtete Vereine ohne Termine</CardTitle>
            <CardDescription>
              Diagnose, warum (noch) keine Heimspiele als Termine angelegt wurden. Sie werden angelegt, sobald die
              Übernahme an ist und eine eingetragene Spielhalle zu einem Heimspiel passt.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {neue.map((v) => (
              <div key={`neu-${v.vereinId}`} id={`status-${v.vereinId}`} className="flex scroll-mt-20 flex-col gap-1.5 rounded-lg border p-3">
                <p className="font-medium">{v.vereinName}</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Automatische Übernahme: <strong>{v.uebernahmeAktiv ? "an" : "aus"}</strong></li>
                  <li>
                    Eure Spielhallen:{" "}
                    {v.eigeneHallenNamen?.trim() ? (
                      <strong>{v.eigeneHallenNamen.trim().replace(/\s*\n\s*/g, " · ")}</strong>
                    ) : (
                      <strong className="text-destructive">nicht eingetragen — ohne Hallennamen wird kein Heimspiel erkannt</strong>
                    )}
                  </li>
                  <li>
                    Heimspiele laut öffentlichen Daten: <strong>{v.nurOeffentlichHeim}</strong>, davon in einer
                    erkannten eigenen Halle: <strong>{v.nurOeffentlichHeimEigeneHalle}</strong>, künftig anlegbar:{" "}
                    <strong>{v.trockenlauf.neuAnzulegenGesamt}</strong>
                  </li>
                  {v.andereHallenNamen.length > 0 && (
                    <li>
                      Hallen der Heimspiele, die nicht als eigene erkannt wurden:{" "}
                      {v.andereHallenNamen.map((h) => `${h.name} (${h.anzahl}×)`).join(" · ")} — passt einer davon zu eurer
                      Halle? Dann den Namen (oder einen Teil davon) bei „Eure Spielhallen“ eintragen.
                    </li>
                  )}
                </ul>
                {!v.uebernahmeAktiv && (
                  <form action={ligaUebernahmeSchalten}>
                    <input type="hidden" name="vereinId" value={v.vereinId} />
                    <input type="hidden" name="aktiv" value="1" />
                    <input type="hidden" name="ziel" value="status" />
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      pendingText="Speichert…"
                      confirmText={`Für ${v.vereinName} die automatische Übernahme einschalten? Fehlende künftige Heimspiele werden dann angelegt.`}
                    >
                      Automatische Übernahme einschalten
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quellen-Konflikte (nuLiga und handball.net)</CardTitle>
          <CardDescription>
            Nur lesend. Mannschaften eines Vereins, die in derselben Saison über nuLiga UND handball.net laufen, aber als zwei verschiedene
            Mannschaften geführt werden — mögliche Dubletten auf der öffentlichen Seite. „Vom Sync getrennt“ heißt: der handball.net-Sync hat die
            Kollision erkannt und die DHB-Mannschaft bewusst getrennt geführt („… (DHB)“); „Mögliche Dublette“ wurde nicht erkannt und sollte geprüft werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {quellenKonflikte.length === 0 ? (
            <p className="text-muted-foreground">Keine Konflikte gefunden.</p>
          ) : (
            quellenKonflikte.map((k, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{k.vereinName}</span>
                  <Badge variant="outline">{k.saison}</Badge>
                  <Badge variant={k.vomSyncGetrennt ? "secondary" : "warning"}>{k.vomSyncGetrennt ? "Vom Sync getrennt" : "Mögliche Dublette"}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  nuLiga: {k.nuliga.mannschaftName} ({k.nuliga.ligaName})
                </p>
                <p className="text-muted-foreground">
                  handball.net: {k.handballNet.mannschaftName} ({k.handballNet.ligaName})
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schalter und Tests</CardTitle>
          <CardDescription>
            Je Verein: automatische Übernahme und Hallenplan-Import. Die Vergleiche gibt es nur, solange der
            Hallenplan-Import noch an ist (danach gibt es nichts mehr zu vergleichen).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {pruefbar.map((v) => (
            <div key={`details-${v.vereinId}`} id={`details-${v.vereinId}`} className="flex scroll-mt-20 flex-col gap-2 rounded-lg border p-3">
              <p className="font-medium">{v.vereinName}</p>
              <div className="flex flex-wrap items-center gap-3">
                <form action={ligaUebernahmeSchalten} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="vereinId" value={v.vereinId} />
                    <input type="hidden" name="aktiv" value={v.uebernahmeAktiv ? "0" : "1"} />
                    <Badge variant={v.uebernahmeAktiv ? "default" : "outline"}>
                      Automatische Übernahme: {v.uebernahmeAktiv ? "an" : "aus"}
                    </Badge>
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      pendingText="Speichert…"
                      confirmText={
                        v.uebernahmeAktiv
                          ? `Automatische Übernahme für ${v.vereinName} ausschalten?`
                          : `Für ${v.vereinName} künftige Heimspiele ab jetzt automatisch (nach jedem Liga-Sync) anlegen? Still, ohne Mails, es wird nichts geändert oder gelöscht.`
                      }
                    >
                      {v.uebernahmeAktiv ? "Ausschalten" : "Einschalten"}
                    </ConfirmSubmitButton>
                  </form>
                  <form action={hallenplanImportSchalten} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="vereinId" value={v.vereinId} />
                    <input type="hidden" name="aus" value={v.hallenplanAus ? "0" : "1"} />
                    <Badge variant={v.hallenplanAus ? "default" : "outline"}>
                      Hallenplan-Import: {v.hallenplanAus ? "aus" : "an"}
                    </Badge>
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      pendingText="Speichert…"
                      confirmText={
                        v.hallenplanAus
                          ? `Hallenplan-Import für ${v.vereinName} wieder einschalten?`
                          : `Hallenplan-Import für ${v.vereinName} ausschalten? Spielplan, Verlegungen, Ergebnisse und Ansetzung kommen dann nur noch aus den öffentlichen Liga-Daten. ACHTUNG: Freundschaftsspiele und Turniere werden dann nicht mehr automatisch angelegt, sondern müssen von Hand eingetragen werden (die automatische Pflege wird entwickelt). Bereits vorhandene Termine, Dienste und Freundschaftsspiele bleiben unverändert. Jederzeit wieder einschaltbar.`
                      }
                    >
                      {v.hallenplanAus ? "Wieder einschalten" : "Ausschalten"}
                    </ConfirmSubmitButton>
                    {!v.hallenplanAus && (
                      <span className="basis-full text-xs text-muted-foreground">
                        Erst möglich, wenn die Übernahme an ist und oben nichts mehr zu tun ist. Freundschaftsspiele/Turniere
                        müssen danach von Hand angelegt werden.
                      </span>
                    )}
                  </form>
              </div>
              {!v.hallenplanAus && (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={ansetzungVergleichen} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="vereinId" value={v.vereinId} />
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      pendingText="Vergleicht… (bis ca. 1 Minute)"
                      confirmText={`Angesetzte Schiedsrichter von ${v.vereinName} aus den öffentlichen nuLiga-Seiten mit den Hallenplan-Terminen vergleichen? Es wird nur gelesen, nichts gespeichert oder geändert. Dauert bis ca. 1 Minute.`}
                    >
                      Ansetzung vergleichen (nuLiga)
                    </ConfirmSubmitButton>
                  </form>
                  <form action={ansetzungVergleichen} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="vereinId" value={v.vereinId} />
                    <input type="hidden" name="quelle" value="handball_net" />
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      pendingText="Vergleicht…"
                      confirmText={`Angesetzte Schiedsrichter und Zeitnehmer von ${v.vereinName} aus handball.net mit den Hallenplan-Terminen vergleichen? Es wird nur gelesen, nichts gespeichert oder geändert.`}
                    >
                      Ansetzung vergleichen (handball.net)
                    </ConfirmSubmitButton>
                  </form>
                  {ergebnisInfo.verein === v.vereinId && ergebnisInfo.av === "1" && (
                    <div className="rounded-md border bg-muted/40 p-2 text-xs">
                      <p>
                        Verglichen: <strong>{ergebnisInfo.avg}</strong> verknüpfte {ergebnisInfo.avq === "handball_net" ? "handball.net" : "nuLiga"}-Termine — gleich:{" "}
                        <strong>{ergebnisInfo.avgl}</strong>, verschieden: <strong>{ergebnisInfo.avv}</strong>, nur im
                        Hallenplan: <strong>{ergebnisInfo.avh}</strong>, nur öffentlich:{" "}
                        <strong>{ergebnisInfo.avo}</strong>, beide ohne Ansetzung: <strong>{ergebnisInfo.avl}</strong>.
                        {Number(ergebnisInfo.avf) > 0 && ` ${ergebnisInfo.avf} Gruppenseite(n) nicht ladbar.`}
                      </p>
                      {(() => {
                        try {
                          const bsp = JSON.parse(ergebnisInfo.avb ?? "[]") as { termin: string; hallenplan: string | null; oeffentlich: string | null }[];
                          return bsp.length > 0 ? (
                            <ul className="mt-1 list-disc pl-4">
                              {bsp.map((b, i) => (
                                <li key={i}>
                                  {b.termin}: Hallenplan „{b.hallenplan ?? "—"}“ · öffentlich „{b.oeffentlich ?? "—"}“
                                </li>
                              ))}
                            </ul>
                          ) : null;
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
