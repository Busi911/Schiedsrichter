import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { adminDb } from "@/db/admin";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { gruppiereProTag } from "@/lib/kalender";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Logo } from "@/components/logo";
import {
  formatDatumZeit as formatDateTime,
  formatWochentagDatum,
  formatZeit,
} from "@/lib/format";

const ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

// Öffentliche, login-freie Lese-Ansicht — Kenntnis des Tokens ist die
// Berechtigung (wie bei den Login-Links). Bewusst adminDb (RLS-frei), da es
// hier keine Session/vereinId gibt; jede Abfrage ist eng auf den einen
// gefundenen Turnier-Datensatz bzw. dessen id begrenzt.
export default async function OeffentlicheTurnierseite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const turnier = await adminDb.query.termine.findFirst({
    where: eq(termine.freigabeToken, token),
  });
  if (!turnier || turnier.typ !== "turnier") {
    notFound();
  }

  const [verein, spiele] = await Promise.all([
    adminDb.query.vereine.findFirst({ where: eq(vereine.id, turnier.vereinId) }),
    adminDb.query.termine.findMany({
      where: eq(termine.turnierId, turnier.id),
      orderBy: (t, { asc }) => [asc(t.start)],
    }),
  ]);

  const spielIds = spiele.map((s) => s.id);
  const alleZuordnungen = spielIds.length
    ? await adminDb
        .select({
          terminId: terminZuordnungen.terminId,
          funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
          name: users.name,
          email: users.email,
          externerName: terminZuordnungen.externerName,
        })
        .from(terminZuordnungen)
        // LEFT JOIN: Zuordnungen ohne Login-Account (externerName statt
        // userId) sollen im öffentlichen Spielplan trotzdem sichtbar sein.
        .leftJoin(users, eq(terminZuordnungen.userId, users.id))
        .where(inArray(terminZuordnungen.terminId, spielIds))
    : [];

  const tage = gruppiereProTag(spiele);
  // Mehrspaltig (bis zu 3 nebeneinander auf großen Bildschirmen, mobil
  // untereinander) nur bei mehrtägigen Turnieren — bei eintägigen wäre eine
  // einzelne Spalte in einem breiten Grid nur unnötig gestreckt.
  const mehrtaegig = tage.length > 1;
  // In eine eigene Konstante gezogen, damit TS die notFound()-Narrowing von
  // `turnier` nicht beim Zugriff aus den unten definierten verschachtelten
  // Funktionen verliert.
  const turnierOrt = turnier.ort;

  // Ort steht an einem Turniertag praktisch immer für alle Spiele fest
  // (eine Halle) — dann gehört er einmal in den Tages-Header statt sich in
  // jeder Zeile zu wiederholen. Nur wenn an einem Tag tatsächlich
  // unterschiedliche Orte vorkommen (mehrere Hallen/Felder gleichzeitig),
  // braucht es die Ort-Spalte in der Tabelle zurück.
  function gemeinsamerOrt(items: typeof spiele): string | null {
    const orte = new Set(items.map((s) => s.ort).filter((o): o is string => !!o));
    if (orte.size === 1) return [...orte][0];
    if (orte.size === 0) return turnierOrt ?? null;
    return null;
  }

  function spielTabelle(items: typeof spiele, mitOrtSpalte: boolean) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zeit</TableHead>
            {mitOrtSpalte && <TableHead>Ort</TableHead>}
            <TableHead>Begegnung</TableHead>
            <TableHead>Besetzung</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => {
            const besetzung = alleZuordnungen.filter((z) => z.terminId === s.id);
            return (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{formatZeit(s.start)}</TableCell>
                {mitOrtSpalte && (
                  <TableCell className="text-muted-foreground">
                    {s.ort ?? turnierOrt ?? "—"}
                  </TableCell>
                )}
                <TableCell className="whitespace-normal">
                  {s.beschreibung ?? "—"}
                  {s.ergebnisHeim !== null && s.ergebnisAuswaerts !== null && (
                    <span className="ml-2 font-medium">
                      {s.ergebnisHeim}:{s.ergebnisAuswaerts}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {besetzung.length === 0 ? (
                    // Badge statt reinem Fließtext, wie bei "Besetzung offen"
                    // überall sonst in der App (z.B. Schiedsrichterwart-Seite).
                    <Badge variant="outline" className="w-fit">
                      Besetzung noch offen
                    </Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {besetzung.map((z) => (
                        <Badge
                          key={`${z.terminId}-${z.funktionstraegerTyp}-${z.email ?? z.externerName}`}
                          variant="secondary"
                        >
                          {ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}:{" "}
                          {z.name ?? z.externerName ?? z.email}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <main
      className={`mx-auto flex min-h-screen flex-col gap-6 p-6 ${
        mehrtaegig ? "max-w-5xl" : "max-w-3xl"
      }`}
    >
      <div className="flex items-center gap-3">
        <Logo className="size-8 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {verein?.name ?? "Turnier"}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            {turnier.beschreibung ?? "Turnier"}
          </h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Übersicht</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Beginn:</span>{" "}
            {formatDateTime(turnier.start)}
          </p>
          {turnier.ende && (
            <p>
              <span className="text-muted-foreground">Ende:</span>{" "}
              {formatDateTime(turnier.ende)}
            </p>
          )}
          {turnier.ort && (
            <p>
              <span className="text-muted-foreground">Ort:</span> {turnier.ort}
            </p>
          )}
        </CardContent>
      </Card>

      {spiele.length === 0 ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Spielplan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Der Spielplan steht noch nicht fest.
            </p>
          </CardContent>
        </Card>
      ) : mehrtaegig ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tage.map((tag) => {
            const ort = gemeinsamerOrt(tag.items);
            return (
              <Card key={tag.tag} className="min-w-0">
                <CardHeader>
                  <CardTitle className="text-base">
                    {formatWochentagDatum(tag.items[0].start)}
                  </CardTitle>
                  {ort && <CardDescription>{ort}</CardDescription>}
                </CardHeader>
                <CardContent>{spielTabelle(tag.items, !ort)}</CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Spielplan</CardTitle>
            {gemeinsamerOrt(spiele) && (
              <CardDescription>{gemeinsamerOrt(spiele)}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {spielTabelle(spiele, !gemeinsamerOrt(spiele))}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Rein lesende Ansicht — HandballerPate
      </p>
    </main>
  );
}
