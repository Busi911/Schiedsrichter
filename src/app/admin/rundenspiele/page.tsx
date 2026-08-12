import { and, asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, termine } from "@/db/schema";
import {
  mannschaftAusRundenspielAnlegen,
  rundenspieleImportieren,
  testspielDuplikatVerknuepfen,
} from "../actions";
import { gruppiereUnbekannteMannschaften } from "@/lib/rundenspiel-import";
import { findeTestspielDuplikate } from "@/lib/duplikat-erkennung";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

export default async function RundenspielePage({
  searchParams,
}: {
  searchParams: Promise<{
    importNeu?: string;
    importAktualisiert?: string;
    importFehler?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const importErgebnis = await searchParams;

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

  const unbekannteMannschaften = gruppiereUnbekannteMannschaften(liste);
  const moeglicheDuplikate = await findeTestspielDuplikate(vereinId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Hallenspielplan</h1>
        <p className="text-sm text-muted-foreground">
          Alle Spiele an der eigenen Halle — Liga-Pflichtspiele ebenso wie
          Freundschaftsspiele/Turniere, importiert aus nuLiga oder per
          JSON-Export pro Halle. Inklusive Spiele fremder Mannschaften an der
          eigenen Halle (relevant für Ordner-/Kioskdienst).
        </p>
      </div>

      {importErgebnis.importNeu !== undefined && (
        <Alert
          variant={importErgebnis.importFehler ? "destructive" : "default"}
          className="max-w-2xl"
        >
          <AlertTitle>
            Import: {importErgebnis.importNeu} neu,{" "}
            {importErgebnis.importAktualisiert ?? 0} aktualisiert
          </AlertTitle>
          {importErgebnis.importFehler && (
            <AlertDescription>
              {importErgebnis.importFehler.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
            </AlertDescription>
          )}
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Spielplan importieren</CardTitle>
          <CardDescription>
            JSON-Export aus nuLiga (pro Halle). Enthält euer Verein mehrere
            Hallen, könnt ihr entweder mehrere Exporte nacheinander hochladen
            oder einen Export mit mehreren Hallen-Blöcken verwenden — beides
            wird unterstützt. Ein erneuter Import desselben Spielplans
            aktualisiert bestehende Spiele (z.B. bei Terminverlegung) statt
            sie zu duplizieren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={rundenspieleImportieren}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="datei">JSON-Datei</Label>
              <input
                id="datei"
                name="datei"
                type="file"
                accept=".json,application/json"
                required
                className="text-sm"
              />
            </div>
            <Button type="submit">Importieren</Button>
          </form>
        </CardContent>
      </Card>

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
              &uuml;bersprungen werden.
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
                  <Button type="submit" variant="outline" size="sm">
                    Als Mannschaft anlegen
                  </Button>
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
              Manuell angelegte Freundschaftsspiele (z.B. weil noch kein
              Schiedsrichter feststand), die inzwischen auch über den
              Hallenspielplan importiert wurden (als Liga- oder
              Freundschaftsspiel, siehe Beschreibung unten) — dieselbe
              Begegnung taucht sonst doppelt im Kalender auf. Beim
              Verknüpfen werden bereits erfasste Zuordnungen (Schiedsrichter/
              Zeitnehmer/Sekretär) und Zuschüsse auf den Hallenspielplan-
              Eintrag übertragen, das doppelte Freundschaftsspiel wird
              anschließend entfernt.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {moeglicheDuplikate.map((d) => (
                <div
                  key={`${d.testspielId}-${d.rundenspielId}`}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm">
                    <p>
                      <strong>Freundschaftsspiel:</strong>{" "}
                      {formatDateTime(d.testspielStart)}
                      {d.testspielBeschreibung ? ` · ${d.testspielBeschreibung}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      <strong>Hallenspielplan:</strong> {formatDateTime(d.rundenspielStart)}
                      {d.rundenspielBeschreibung ? ` · ${d.rundenspielBeschreibung}` : ""}
                    </p>
                  </div>
                  <form action={testspielDuplikatVerknuepfen}>
                    <input type="hidden" name="testspielId" value={d.testspielId} />
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

      <Card>
        <CardHeader>
          <CardTitle>Alle importierten Spiele</CardTitle>
        </CardHeader>
        <CardContent>
          {liste.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Spiele importiert.
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {liste.map((t) => (
                <div key={t.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-sm font-medium">
                      {formatDateTime(t.start)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t.ort ?? "—"}
                    </span>
                  </div>
                  <p className="text-sm">{t.beschreibung ?? "—"}</p>
                  {t.mannschaftName && (
                    <p className="text-xs text-muted-foreground">
                      Eigene Mannschaft: {t.mannschaftName}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
