import { and, asc, eq } from "drizzle-orm";
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

      {session.user.istAdmin && unbekannteMannschaften.length > 0 && (
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

      {session.user.istAdmin && moeglicheDuplikate.length > 0 && (
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
