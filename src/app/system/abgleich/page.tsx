import { requireSystemAdmin } from "@/lib/session";
import { berechneHallenplanAbgleich } from "@/lib/hallenplan-abgleich-laden";
import { formatDatumZeit } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_LABEL = {
  unklar: "Unklar",
  mehrdeutig: "Mehrdeutig",
  kein_treffer: "Kein Treffer",
  sicher: "Sicher",
} as const;

export default async function AbgleichPage() {
  await requireSystemAdmin();
  const vereine = await berechneHallenplanAbgleich();
  const mitTerminen = vereine.filter((v) => v.termineGesamt > 0 || v.hatLigaVerein);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Hallenplan-Abgleich</h1>
        <p className="text-sm text-muted-foreground">
          Nur Bericht, es wird nichts verändert: Wie viele per Hallen-ID importierte Termine lassen sich
          sicher einem Spiel der öffentlichen Liga-Daten zuordnen (Voraussetzung, um beide Wege
          zusammenzuführen, ohne Zuordnungen von Schiris/Zeitnehmern zu verlieren)?
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Verein</TableHead>
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
                  <TableCell className="font-medium">
                    {v.vereinName}
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

      {mitTerminen
        .filter((v) => v.hatLigaVerein && v.termineGesamt > 0)
        .map((v) => {
          const t = v.trockenlauf;
          return (
            <Card key={`trocken-${v.vereinId}`}>
              <CardHeader>
                <CardTitle className="text-base">{v.vereinName}: Trockenlauf Zusammenführung</CardTitle>
                <CardDescription>
                  Vorschau, was die Zusammenführung tun WÜRDE — es wird nichts geändert.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <strong>{t.verknuepfbar}</strong> Termine würden mit dem öffentlichen Spiel verknüpft, davon{" "}
                    <strong>{t.verknuepfbarMitZuordnungen}</strong> mit eingetragenen Funktionsträgern (diese
                    Zuordnungen bleiben erhalten).
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
                    <strong>{t.neuAnzulegenGesamt}</strong> Heimspiele in eigener Halle ohne Termin würden neu
                    angelegt.
                  </li>
                  <li>
                    <strong>{t.unberuehrt}</strong> Termine ohne sichere Zuordnung blieben unverändert (davon{" "}
                    <strong>{t.unberuehrtMitZuordnungen}</strong> mit Zuordnungen).
                  </li>
                </ul>
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
