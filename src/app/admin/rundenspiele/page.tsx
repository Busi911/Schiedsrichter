import { and, asc, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { ignorierteMannschaften, mannschaften, termine } from "@/db/schema";
import {
  mannschaftAusRundenspielAnlegen,
  spielDuplikatVerknuepfen,
  unbekannteMannschaftAblehnen,
} from "../actions";
import { gruppiereUnbekannteMannschaften } from "@/lib/rundenspiel-import";
import { findeSpielDuplikate } from "@/lib/duplikat-erkennung";
import { Button } from "@/components/ui/button";
import { RundenspieleListe } from "@/components/rundenspiele-liste";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LabeledSelect, type LabeledSelectOption } from "@/components/labeled-select";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

const QUELL_TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
};

export default async function RundenspielePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const liste = await withTenant(vereinId, (tx) =>
    tx
      .select({
        id: termine.id,
        start: termine.start,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        mannschaftId: termine.mannschaftId,
        mannschaftName: mannschaften.name,
        heimMannschaftName: termine.heimMannschaftName,
        auswaertsMannschaftName: termine.auswaertsMannschaftName,
        kategorie: termine.kategorie,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(and(eq(termine.vereinId, vereinId), eq(termine.typ, "rundenspiel")))
      .orderBy(asc(termine.start))
  );

  const ignoriert = await withTenant(vereinId, (tx) =>
    tx.query.ignorierteMannschaften.findMany({
      where: eq(ignorierteMannschaften.vereinId, vereinId),
    })
  );
  const ignoriertSet = new Set(
    ignoriert.map((i) => `${i.normalisierterName}::${i.kategorie ?? ""}`)
  );
  const unbekannteMannschaften = gruppiereUnbekannteMannschaften(liste).filter(
    (m) => !ignoriertSet.has(`${m.normalisiert}::${m.kategorie ?? ""}`)
  );
  const moeglicheDuplikate = await findeSpielDuplikate(vereinId);

  // Für "Manuell verknüpfen" unten: alle manuell angelegten Freundschafts-/
  // Turnier-Einzelspiele als Auswahl, unabhängig davon, ob die automatische
  // Erkennung sie oben bereits vorgeschlagen hat (die Heuristik übersieht
  // z.B. stark abweichende Namen).
  const [quellenRoh, turniere] = await withTenant(vereinId, async (tx) => {
    const quellenRoh = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        inArray(termine.typ, ["testspiel", "turnier_spiel"]),
        eq(termine.quelle, "manuell")
      ),
      orderBy: (t, { asc: ascOrder }) => [ascOrder(t.start)],
    });
    const turnierIds = [
      ...new Set(
        quellenRoh
          .map((q) => q.turnierId)
          .filter((id): id is string => !!id)
      ),
    ];
    const turniere = turnierIds.length
      ? await tx.query.termine.findMany({ where: inArray(termine.id, turnierIds) })
      : [];
    return [quellenRoh, turniere];
  });
  const turnierTitel = new Map(turniere.map((t) => [t.id, t.beschreibung ?? "Turnier"]));
  const quellenOptionen: LabeledSelectOption[] = quellenRoh.map((q) => ({
    value: q.id,
    label: `${formatDateTime(q.start)}${q.beschreibung ? ` · ${q.beschreibung}` : ""}`,
    group:
      q.typ === "turnier_spiel"
        ? `Turnier: ${turnierTitel.get(q.turnierId ?? "") ?? "?"}`
        : "Freundschaftsspiele",
  }));
  const rundenspielOptionen: LabeledSelectOption[] = liste.map((r) => ({
    value: r.id,
    label: `${formatDateTime(r.start)}${r.beschreibung ? ` · ${r.beschreibung}` : ""}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Hallenspielplan</h1>
        <p className="text-sm text-muted-foreground">
          Alle Spiele an der eigenen Halle — Liga-Pflichtspiele ebenso wie
          Freundschaftsspiele/Turniere, automatisch aus nuLiga synchronisiert
          (siehe Einstellungen). Inklusive Spiele fremder Mannschaften an der
          eigenen Halle (relevant für Ordner-/Kioskdienst).
        </p>
      </div>

      {unbekannteMannschaften.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Unbekannte Mannschaften</CardTitle>
            <CardDescription>
              Heim-/Auswärtsnamen aus dem Import, die noch keiner Mannschaft
              zugeordnet sind — sortiert nach Häufigkeit. Bereits importierte
              Spiele werden beim Anlegen rückwirkend verknüpft.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <strong>Nur eure eigenen Mannschaften anlegen.</strong> Die
              Halle wird auch von anderen Vereinen bespielt — deren
              Mannschaften tauchen hier zwangsläufig mit auf und sollten
              per &bdquo;Ablehnen&ldquo; entfernt werden, statt sie zu
              &uuml;berspringen (sonst erscheinen sie bei jedem weiteren
              Import erneut).
            </div>
            <div className="flex flex-col divide-y">
              {unbekannteMannschaften.map((m) => (
                <form
                  key={`${m.normalisiert}::${m.kategorie ?? ""}`}
                  action={mannschaftAusRundenspielAnlegen}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <input type="hidden" name="name" value={m.anzeigeName} />
                  <input type="hidden" name="kategorie" value={m.kategorie ?? ""} />
                  <span className="text-sm">
                    {m.anzeigeName}
                    {m.kategorie && (
                      <span className="text-muted-foreground"> ({m.kategorie})</span>
                    )}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({m.anzahlSpiele} {m.anzahlSpiele === 1 ? "Spiel" : "Spiele"})
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      formAction={unbekannteMannschaftAblehnen}
                      variant="ghost"
                      size="sm"
                    >
                      Ablehnen
                    </Button>
                    <Button type="submit" variant="outline" size="sm">
                      Als Mannschaft anlegen
                    </Button>
                  </div>
                </form>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {moeglicheDuplikate.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Mögliche Duplikate</CardTitle>
            <CardDescription>
              Manuell angelegte Freundschaftsspiele/Turnier-Einzelspiele
              (z.B. weil noch kein Schiedsrichter feststand), die
              inzwischen auch über den Hallenspielplan importiert wurden
              (als Liga- oder Freundschaftsspiel, siehe Beschreibung unten)
              — dieselbe Begegnung taucht sonst doppelt im Kalender auf.
              Beim Verknüpfen werden bereits erfasste Zuordnungen
              (Schiedsrichter/Zeitnehmer/Sekretär) auf den
              Hallenspielplan-Eintrag übertragen, das doppelte
              Freundschaftsspiel/Turnier-Einzelspiel wird anschließend
              entfernt. Bei einem Turnier-Einzelspiel bleibt der
              Hallenspielplan-Eintrag danach im Turnier sichtbar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {moeglicheDuplikate.map((d) => (
                <div
                  key={`${d.quellId}-${d.rundenspielId}`}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm">
                    <p>
                      <strong>{QUELL_TYP_LABEL[d.quellTyp] ?? d.quellTyp}:</strong>{" "}
                      {formatDateTime(d.quellStart)}
                      {d.quellBeschreibung ? ` · ${d.quellBeschreibung}` : ""}
                    </p>
                    {d.quellBesetzung.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {d.quellBesetzung.join(" · ")}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      <strong>Hallenspielplan:</strong> {formatDateTime(d.rundenspielStart)}
                      {d.rundenspielBeschreibung ? ` · ${d.rundenspielBeschreibung}` : ""}
                    </p>
                    {d.rundenspielBesetzung.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {d.rundenspielBesetzung.join(" · ")}
                      </p>
                    )}
                  </div>
                  <form action={spielDuplikatVerknuepfen}>
                    <input type="hidden" name="quellId" value={d.quellId} />
                    <input type="hidden" name="rundenspielId" value={d.rundenspielId} />
                    <Button type="submit" variant="outline" size="sm">
                      Verknüpfen
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {quellenOptionen.length > 0 && rundenspielOptionen.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Manuell verknüpfen</CardTitle>
            <CardDescription>
              Falls die automatische Erkennung oben ein Duplikat nicht
              findet (z.B. weil Name oder Uhrzeit zu stark abweichen):
              Freundschaftsspiel oder Turnier-Einzelspiel von Hand mit dem
              passenden Hallenspielplan-Eintrag verknüpfen — gleiches
              Verhalten wie bei den automatischen Vorschlägen oben.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={spielDuplikatVerknuepfen}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <Label htmlFor="quellId" className="text-xs">
                  Manuell angelegtes Spiel
                </Label>
                <LabeledSelect
                  id="quellId"
                  name="quellId"
                  placeholder="Spiel wählen…"
                  required
                  options={quellenOptionen}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="rundenspielId" className="text-xs">
                  Hallenspielplan-Eintrag
                </Label>
                <LabeledSelect
                  id="rundenspielId"
                  name="rundenspielId"
                  placeholder="Eintrag wählen…"
                  required
                  options={rundenspielOptionen}
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                Verknüpfen
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alle importierten Spiele</CardTitle>
        </CardHeader>
        <CardContent>
          <RundenspieleListe liste={liste} />
        </CardContent>
      </Card>
    </div>
  );
}
