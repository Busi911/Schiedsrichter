import { requireSystemAdmin } from "@/lib/session";
import { berechneHallenplanAbgleich } from "@/lib/hallenplan-abgleich-laden";
import { formatDatumZeit } from "@/lib/format";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { ansetzungVergleichen, hallenplanVerknuepfen, ligaSpieleUebernehmen, ligaUebernahmeSchalten } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const vereine = await berechneHallenplanAbgleich();
  const mitTerminen = vereine.filter((v) => v.termineGesamt > 0 || v.hatLigaVerein);
  const pruefbar = mitTerminen.filter((v) => v.hatLigaVerein && v.termineGesamt > 0);
  // Was bei einem Verein noch Handlung braucht (abgeschlossene Schritte tauchen hier nicht auf).
  const handlungen = (v: (typeof vereine)[number]): string[] => {
    const t = v.trockenlauf;
    const l: string[] = [];
    if (t.verknuepfbarOffen > 0) l.push(`${t.verknuepfbarOffen} sicher zugeordnete Termine sind noch nicht mit dem öffentlichen Spiel verknüpft.`);
    if (!v.uebernahmeAktiv) l.push("Die automatische Übernahme (fehlende Heimspiele, Verlegungen, Ergebnisse, Ansetzung) ist ausgeschaltet.");
    // nur künftige Termine: Spiele der Vorsaison werden nie zuordenbar (stehen weiter in den Details)
    if (t.pflichtOffenKuenftig > 0) l.push(`${t.pflichtOffenKuenftig} künftige Liga-Pflichtspiel-Termine sind nicht sicher zugeordnet — bitte in den Details unter „nicht sicher zugeordnet“ prüfen.`);
    if (t.ortAbweichungenKuenftig > 0) l.push(`${t.ortAbweichungenKuenftig} künftige Termine mit anderem Hallennamen als öffentlich — prüfen, ob nur ein anderer Name oder eine echte Verlegung (Beispiele in den Details).`);
    return l;
  };
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
          Zusammenführung von Hallenplan-Import (Hallen-ID) und öffentlichen Liga-Daten. Oben steht nur,
          was bei einem Verein noch Handlung braucht; abgeschlossene Schritte haben keinen Knopf mehr.
          Zahlen, Trockenlauf und Prüfwerkzeuge liegen eingeklappt darunter.
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
                    {v.uebernahmeAktiv ? "an" : "aus"}
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

      <details className="rounded-lg border">
        <summary className="cursor-pointer p-3 text-sm font-medium">Alle Zahlen im Überblick (Detailtabelle)</summary>
      <Card className="border-0 shadow-none">
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">Verein</TableHead>
                <TableHead>Termine</TableHead>
                <TableHead>Sicher</TableHead>
                <TableHead>Unklar</TableHead>
                <TableHead>Mehrdeutig</TableHead>
                <TableHead>Kein Treffer</TableHead>
                <TableHead>Nur öffentlich: Heim, eigene Halle</TableHead>
                <TableHead>Heim, andere/unbekannte Halle</TableHead>
                <TableHead>Nur öffentlich: Auswärts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mitTerminen.map((v) => (
                <TableRow key={v.vereinId}>
                  <TableCell className="sticky left-0 z-10 max-w-40 bg-card font-medium whitespace-normal [overflow-wrap:anywhere]">
                    {/* Spielgemeinschaften heißen "A/B…" ohne Leerzeichen: nach dem "/" umbrechen
                        (sonst ragt der lange Name in die nächste Spalte). */}
                    {v.vereinName.replaceAll("/", "/\u200b")}
                    {!v.hatLigaVerein && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        keine öffentliche Seite eingerichtet
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{v.termineGesamt}</TableCell>
                  <TableCell>{v.anzahl.sicher}</TableCell>
                  <TableCell>{v.anzahl.unklar}</TableCell>
                  <TableCell>{v.anzahl.mehrdeutig}</TableCell>
                  <TableCell>
                    {v.anzahl.kein_treffer}
                    {v.keinTrefferFreundschaft > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        davon {v.keinTrefferFreundschaft} Freundschaft/Turnier
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{v.nurOeffentlichHeimEigeneHalle}</TableCell>
                  <TableCell>
                    {v.nurOeffentlichHeimAndereHalle + v.nurOeffentlichHeimHalleUnbekannt}
                    {v.andereHallenNamen.length > 0 && (
                      <span className="block max-w-56 text-xs font-normal whitespace-normal text-muted-foreground">
                        {v.andereHallenNamen.map((h) => `${h.name} (${h.anzahl})`).join(", ")}
                      </span>
                    )}
                    {v.nurOeffentlichHeimHalleUnbekannt > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        davon {v.nurOeffentlichHeimHalleUnbekannt} ohne Hallenangabe
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{v.nurOeffentlichAuswaerts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            „Nur öffentlich“: Liga-Spiele eigener Mannschaften ohne Hallenplan-Termin. Auswärtsspiele stehen
            nie im eigenen Hallenplan (unproblematisch). Heimspiele in einer eigenen Halle würden bei der
            Zusammenführung neu angelegt; Heimspiele in einer anderen Halle (z.B. der Partnerhalle einer
            Spielgemeinschaft) brauchen keine Einteilung. „Kein Treffer“ ohne Freundschaft/Turnier sind meist Spiele anderer Vereine in
            eurer Halle oder Liga-Daten, die (noch) fehlen.
          </p>
        </CardContent>
      </Card>
      </details>

      <details className="rounded-lg border" open={!!ergebnisInfo.verein}>
        <summary className="cursor-pointer p-3 text-sm font-medium">
          Details und Prüfwerkzeuge je Verein (Trockenlauf, Ansetzung vergleichen, Schalter)
        </summary>
        <div className="flex flex-col gap-6 p-3">
      {mitTerminen
        .filter((v) => v.hatLigaVerein && v.termineGesamt > 0)
        .map((v) => {
          const t = v.trockenlauf;
          return (
            <Card key={`trocken-${v.vereinId}`} id={`details-${v.vereinId}`} className="scroll-mt-20">
              <CardHeader>
                <CardTitle className="text-base">{v.vereinName}: Trockenlauf Zusammenführung</CardTitle>
                <CardDescription>
                  Vorschau, was die Zusammenführung tun WÜRDE — es wird nichts geändert.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {t.pflichtOffen === 0 ? (
                  <p className="rounded-lg bg-green-100 p-3 text-green-900 dark:bg-green-950 dark:text-green-100">
                    <strong>Gut:</strong> Alle {t.pflichtGesamt} Liga-Pflichtspiel-Termine sind sicher zugeordnet.
                    {t.freundschaftGesamt > 0 &&
                      ` Die übrigen ${t.freundschaftGesamt} sind Freundschaftsspiele/Turniere — dafür gibt es keine öffentlichen Daten, sie bleiben bewusst unberührt.`}
                  </p>
                ) : (
                  <p className="rounded-lg bg-amber-100 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                    <strong>Prüfen:</strong> {t.pflichtOffen} von {t.pflichtGesamt} Liga-Pflichtspiel-Terminen sind nicht
                    sicher zugeordnet (siehe Liste „nicht sicher zugeordnet“ weiter unten — Pflichtspiele stehen oben).
                    {t.freundschaftGesamt > 0 &&
                      ` Dazu ${t.freundschaftGesamt} Freundschaftsspiele/Turniere, die erwartbar keine öffentliche Entsprechung haben.`}
                  </p>
                )}
                <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <strong>Hinweis:</strong> Freundschaftsspiele und Turniere kommen vorerst nur über den Hallenplan-Import
                  (Hallen-ID). Die öffentlichen Liga-Daten decken sie noch nicht ab (zukünftiges Feature) — die Hallen-ID
                  bleibt dafür nötig.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>{t.verknuepfbar}</strong> Termine würden mit dem öffentlichen Spiel verknüpft, davon{" "}
                    <strong>{t.verknuepfbarMitZuordnungen}</strong> mit eingetragenen Funktionsträgern (diese
                    Zuordnungen bleiben erhalten).
                  </li>
                  <li>
                    <strong>{t.verknuepfbarMitAnsetzung}</strong> davon haben eine Ansetzung aus dem Hallenplan
                    (Schiedsrichter/Zeitnehmer). Sie liegt nur im privaten Termin und bleibt unverändert.
                  </li>
                  <li>
                    Bei <strong>{t.ergebnisNeu}</strong> verknüpften Terminen käme ein Ergebnis aus den öffentlichen
                    Daten dazu.
                  </li>
                  <li>
                    <strong>{t.zeitAbweichungen.length}</strong> verknüpfte Termine haben eine andere Zeit als das
                    öffentliche Spiel
                    {t.zeitAbweichungen.length > 0 && " (siehe unten — würde als Verlegung gelten)"}.
                  </li>
                  <li>
                    Bei <strong>{t.ortAbweichungen}</strong> verknüpften Terminen schreibt der Hallenplan die Halle anders
                    als die öffentlichen Daten
                    {t.ortAbweichungen > 0 && " (der Ort würde bei der Übernahme NICHT überschrieben)"}.
                    {t.ortBeispiele.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {t.ortBeispiele.map((o) => `${o.anzahl}× „${o.hallenplan}“ → „${o.oeffentlich}“`).join(" · ")}
                      </span>
                    )}
                  </li>
                  <li>
                    <strong>{t.neuAnzulegenGesamt}</strong> künftige Heimspiele in eigener Halle ohne Termin würden neu
                    angelegt.
                    {t.neuVergangen > 0 &&
                      ` Dazu ${t.neuVergangen} bereits vergangene Heimspiele ohne Termin — die werden nicht übernommen (sie stehen auf der öffentlichen Vereinsseite).`}
                  </li>
                  <li>
                    <strong>{t.unberuehrt}</strong> Termine ohne sichere Zuordnung blieben unverändert (davon{" "}
                    <strong>{t.unberuehrtMitZuordnungen}</strong> mit Zuordnungen).
                  </li>
                </ul>
                <div className="flex flex-col gap-2 rounded-lg border p-3">
                  <p>
                    Verknüpft: <strong>{v.bereitsVerknuepft}</strong> von {v.termineGesamt} Terminen.
                  </p>
                  {ergebnisInfo.verein === v.vereinId && (
                    <p className="text-green-700 dark:text-green-400">
                      Gerade verknüpft: {ergebnisInfo.neu} neu, {ergebnisInfo.schon} schon vorhanden
                      {Number(ergebnisInfo.dup) > 0 ? `, ${ergebnisInfo.dup} übersprungen (Duplikate im Hallenplan)` : ""}.
                    </p>
                  )}
                  {ergebnisInfo.verein === v.vereinId && ergebnisInfo.zv !== undefined && (
                    <p
                      className={
                        ergebnisInfo.zv === ergebnisInfo.zn
                          ? "text-xs text-muted-foreground"
                          : "text-xs font-medium text-destructive"
                      }
                    >
                      Kontrolle Dienste (Zuordnungen aller Hallenplan-Termine): vorher {ergebnisInfo.zv}, nachher{" "}
                      {ergebnisInfo.zn}
                      {ergebnisInfo.zv === ergebnisInfo.zn
                        ? " — unverändert."
                        : " — ABWEICHUNG, die Verknüpfung ändert keine Zuordnungen: bitte prüfen, ob parallel jemand Dienste geändert hat."}
                    </p>
                  )}
                  {t.verknuepfbarOffen === 0 && (
                    <p className="text-xs text-muted-foreground">Verknüpfung: erledigt, nichts mehr zu verknüpfen.</p>
                  )}
                  {ergebnisInfo.verein === v.vereinId && ergebnisInfo.ueb !== undefined && (
                    <p className="rounded-md border bg-muted/40 p-2 text-xs">
                      Übernommen: <strong>{ergebnisInfo.ueb}</strong> Termine angelegt
                      {Number(ergebnisInfo.uebdup) > 0 && `, ${ergebnisInfo.uebdup} leere Doppelgänger entfernt`}
                      {Number(ergebnisInfo.uebdupd) > 0 && `, ${ergebnisInfo.uebdupd} Doppelgänger mit Diensten (bitte prüfen)`}
                      {Number(ergebnisInfo.uebzeit) > 0 && `, ${ergebnisInfo.uebzeit} ohne Uhrzeit übersprungen`}. Kontrolle Dienste:
                      vorher {ergebnisInfo.zv}, nachher {ergebnisInfo.zn}
                      {ergebnisInfo.zv === ergebnisInfo.zn ? " — unverändert." : " — ABWEICHUNG, bitte prüfen."}
                    </p>
                  )}
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
                  {t.neuAnzulegenGesamt > 0 && !v.uebernahmeAktiv && (
                    <form action={ligaSpieleUebernehmen}>
                      <input type="hidden" name="vereinId" value={v.vereinId} />
                      <ConfirmSubmitButton
                        size="sm"
                        variant="outline"
                        pendingText="Übernimmt…"
                        confirmText={`Für ${v.vereinName} die fehlenden künftigen Heimspiele aus den öffentlichen Daten als Termine anlegen? Es werden keine Mails verschickt, bestehende Termine, Zeiten und Dienste bleiben unverändert, es wird nichts gelöscht.`}
                      >
                        Fehlende künftige Heimspiele übernehmen
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
                {v.verknuepfte.length > 0 && (
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer font-medium">
                      Verknüpfte Termine anzeigen ({v.verknuepfte.length})
                    </summary>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Hallenplan-Termin</TableHead>
                          <TableHead>Öffentliches Spiel</TableHead>
                          <TableHead>Dienste</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {v.verknuepfte.slice(0, 300).map((x, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-normal">
                              {formatDatumZeit(x.start)}
                              <span className="block text-xs text-muted-foreground">
                                {x.heim} – {x.gast}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs whitespace-normal text-muted-foreground">
                              {x.spiel ?? "nicht mehr in den Daten"}
                              {x.ortAbweichung && <span className="block">Halle anders geschrieben</span>}
                            </TableCell>
                            <TableCell className="text-xs whitespace-normal">
                              {x.zuordnungen > 0 && <span className="block">{x.zuordnungen} Zuordnung(en)</span>}
                              {x.ansetzung && <span className="block text-muted-foreground">mit Ansetzung</span>}
                              {x.zuordnungen === 0 && !x.ansetzung && "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {v.verknuepfte.length > 300 && (
                      <p className="mt-2 text-xs text-muted-foreground">Erste 300 von {v.verknuepfte.length} angezeigt.</p>
                    )}
                  </details>
                )}
                {t.zeitAbweichungen.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">Zeit weicht ab (max. 30)</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Hallenplan</TableHead>
                          <TableHead>Öffentlich</TableHead>
                          <TableHead>Zuordnungen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {t.zeitAbweichungen.slice(0, 30).map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-normal">
                              {formatDatumZeit(a.start)}
                              <span className="block text-xs text-muted-foreground">
                                {a.heim} – {a.gast}
                              </span>
                            </TableCell>
                            <TableCell>{a.neu}</TableCell>
                            <TableCell>{a.zuordnungen}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {t.neuAnzulegen.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">
                      Würde neu angelegt (erste {t.neuAnzulegen.length} von {t.neuAnzulegenGesamt})
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Spiel</TableHead>
                          <TableHead>Halle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {t.neuAnzulegen.map((n, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-normal">
                              {n.datum}
                              {n.uhrzeit ? ` ${n.uhrzeit}` : ""}
                              <span className="block text-xs text-muted-foreground">
                                {n.heim} – {n.gast}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs whitespace-normal text-muted-foreground">
                              {n.halle ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>
      </details>

      {mitTerminen
        .filter((v) => v.auffaellig.length > 0 && v.hatLigaVerein)
        .map((v) => (
          <Card key={v.vereinId}>
            <CardHeader>
              <CardTitle className="text-base">{v.vereinName}: nicht sicher zugeordnet</CardTitle>
              <CardDescription>
                {v.auffaellig.length} Termine, die manuell geprüft werden sollten (max. 30 angezeigt, Pflichtspiele zuerst).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Termin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mögliche Liga-Spiele</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.auffaellig.slice(0, 30).map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-normal">
                        {formatDatumZeit(a.start)}
                        <span className="block text-xs text-muted-foreground">
                          {a.heim} – {a.gast}
                          {a.pflichtspiel === false ? " · Freundschaft/Turnier" : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.status === "kein_treffer" ? "outline" : "warning"}>
                          {STATUS_LABEL[a.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs whitespace-normal text-muted-foreground">
                        {a.kandidaten.length > 0 ? a.kandidaten.join(" · ") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
