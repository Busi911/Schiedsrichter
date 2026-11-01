import { requireSystemAdmin } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { berechneBefunde } from "@/lib/sync-ueberwachung-daten";
import { SCHWELLEN } from "@/lib/sync-ueberwachung";
import { formatDatumZeit } from "@/lib/format";
import { ladeTestStaende } from "@/lib/quellen-test-daten";
import { QuellenTest } from "./quellen-test";
import { SyncFormular } from "./sync-formular";

// Der Sync fragt nuLiga bewusst langsam ab (Mindestabstand) — braucht Zeit, wie der Cron.
// Dasselbe Budget wie die Crons (liga-sync/handball-net-sync route.ts): 40 s reichten bei
// gewachsener Vereinszahl nicht mehr aus, auch nicht für einen einzelnen Verein (siehe CLAUDE.md).
export const maxDuration = 280;

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  await requireSystemAdmin();
  const { ok, fehler } = await searchParams;
  const geprueftAm = new Date();
  const [befunde, staende] = await Promise.all([berechneBefunde(geprueftAm), ladeTestStaende()]);
  const letzterTest = staende.reduce<Date | null>((m, s) => (s.letzterVersuchAm && (!m || s.letzterVersuchAm > m) ? s.letzterVersuchAm : m), null);
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
          <CardTitle className="text-base">Quellen-Test (handball.net, nuLiga, NDR)</CardTitle>
          <CardDescription>
            Die Überwachung oben sieht nur veraltete Daten. Dieser Test ruft die Quellen selbst ab (handball.net: Saisons, Teams, Wettbewerbe, Spiele eines echten Vereins; nuLiga/HHV: Mannschaften und
            Vereinsseite; NDR: Spieltag 1 beider Bundesligen) und zeigt, ob die Antwort noch zu unseren Parsern passt. Ein Cron macht das stündlich (5–21 Uhr UTC) und meldet zwei Fehlschläge in Folge.
            {letzterTest ? ` Letzter Cron-Test: ${formatDatumZeit(letzterTest)}, ${staende.filter((s) => s.fehlerInFolge > 0).length} fehlerhafte Prüfung(en).` : " Der Cron hat noch nicht gelaufen."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuellenTest />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jetzt ausführen</CardTitle>
          <CardDescription>
            Ein Durchlauf dauert bis zu ca. 4,5 Minuten (bei „alle Vereine&rdquo;), bei einem einzelnen Verein meist
            viel schneller. Reicht das Budget bei vielen fälligen Vereinen nicht (v. a. bei „Alles neu laden” ohne
            einzelnen Verein), wiederholt „Automatisch bis alle Vereine durch sind” den Lauf selbst, bis nichts mehr
            offen ist — ohne mehrfaches Klicken. Einzelnen Lauf nicht doppelt klicken.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncFormular />
        </CardContent>
      </Card>
      {ok && <p className="rounded-md border bg-muted p-3 text-sm break-words">{ok}</p>}
      {fehler && <p className="rounded-md border border-destructive p-3 text-sm break-words text-destructive">{fehler}</p>}
    </div>
  );
}
