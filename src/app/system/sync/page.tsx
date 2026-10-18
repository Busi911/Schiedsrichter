import { requireSystemAdmin } from "@/lib/session";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { berechneBefunde } from "@/lib/sync-ueberwachung-daten";
import { SCHWELLEN } from "@/lib/sync-ueberwachung";
import { formatDatumZeit } from "@/lib/format";
import { ligaSyncJetztAusfuehren } from "./actions";

// Der Sync fragt nuLiga bewusst langsam ab (Mindestabstand) — braucht Zeit, wie der Cron.
export const maxDuration = 60;

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  await requireSystemAdmin();
  const { ok, fehler } = await searchParams;
  const geprueftAm = new Date();
  const befunde = await berechneBefunde(geprueftAm);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Liga-Sync</h1>
        <p className="text-sm text-muted-foreground">
          Startet den Liga-Sync von Hand (derselbe wie der stündliche Cron). Er entscheidet je Verein selbst, was fällig
          ist — Mannschaften, die in den letzten 30 Minuten geladen wurden, überspringt er — außer du setzt das Häkchen „Alles neu laden“.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Überwachung der Abgleiche</CardTitle>
            <Badge variant={befunde.length === 0 ? "secondary" : "warning"}>{befunde.length === 0 ? "Alles in Ordnung" : `${befunde.length} Auffälligkeit${befunde.length === 1 ? "" : "en"}`}</Badge>
          </div>
          <CardDescription>
            Geprüft {formatDatumZeit(geprueftAm)}: nuLiga, handball.net, NDR, Übernahme und Ansetzung. Ein Cron prüft fünfmal täglich und mailt euch Systemadmins jeden Befund einmal (bei weiteren betroffenen Vereinen
            sofort, sonst höchstens einmal täglich als Erinnerung; „wieder in Ordnung“ einmal). Schwellen: ein Verein ohne erfolgreichen Abruf seit {SCHWELLEN.vereinOhneErfolgStunden} Stunden oder mit {SCHWELLEN.fehlerInFolge} Fehlern in Folge, NDR-Seiten
            seit {SCHWELLEN.ndrSeiteOhneErfolgStunden} Stunden nicht ladbar. Für einen externen Wächter: <code className="text-xs">/api/cron/sync-ueberwachung?nurPruefen=1</code> mit dem Cron-Secret liefert den Zustand als JSON, ohne Mail.
          </CardDescription>
        </CardHeader>
        {befunde.length > 0 && (
          <CardContent className="flex flex-col gap-3 text-sm">
            {befunde.map((b) => (
              <div key={b.gruppe}>
                <p className="font-medium">{b.titel}</p>
                <ul className="list-disc pl-5 break-words text-muted-foreground">
                  {b.zeilen.map((z) => (
                    <li key={z}>{z}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jetzt ausführen</CardTitle>
          <CardDescription>Dauert bis zu ca. 50 Sekunden. Nicht doppelt klicken.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={ligaSyncJetztAusfuehren} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Nur dieser Verein (Slug, leer = alle)</Label>
              <Input id="slug" name="slug" placeholder="z. B. hsg-linden" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="erzwingen" className="mt-1 size-4" />
              <span>
                Alles neu laden (auch wenn nicht fällig)
                <span className="block text-xs text-muted-foreground">
                  Übergeht Intervall und 30-Minuten-Sperre, z. B. um einen eben erschienenen Spielbericht-Link sofort zu
                  holen. Am besten mit einem Verein, das dauert sonst länger.
                </span>
              </span>
            </label>
            <SubmitButton pendingText="Sync läuft …" className="self-start">
              Liga-Sync jetzt ausführen
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
      {ok && <p className="rounded-md border bg-muted p-3 text-sm break-words">{ok}</p>}
      {fehler && <p className="rounded-md border border-destructive p-3 text-sm break-words text-destructive">{fehler}</p>}
    </div>
  );
}
