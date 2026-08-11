import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { adminDb } from "@/db/admin";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Logo } from "@/components/logo";

const ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

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
        })
        .from(terminZuordnungen)
        .innerJoin(users, eq(terminZuordnungen.userId, users.id))
        .where(inArray(terminZuordnungen.terminId, spielIds))
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spielplan</CardTitle>
        </CardHeader>
        <CardContent>
          {spiele.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Der Spielplan steht noch nicht fest.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead>Begegnung</TableHead>
                  <TableHead>Besetzung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spiele.map((s) => {
                  const besetzung = alleZuordnungen.filter(
                    (z) => z.terminId === s.id
                  );
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {formatDateTime(s.start)}
                      </TableCell>
                      <TableCell>{s.ort ?? "—"}</TableCell>
                      <TableCell>{s.beschreibung ?? "—"}</TableCell>
                      <TableCell>
                        {besetzung.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            noch offen
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {besetzung.map((z) => (
                              <Badge
                                key={`${z.terminId}-${z.funktionstraegerTyp}-${z.email}`}
                                variant="secondary"
                              >
                                {ROLLE_LABEL[z.funktionstraegerTyp] ??
                                  z.funktionstraegerTyp}
                                : {z.name ?? z.email}
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
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Rein lesende Ansicht — FunktionsträgerHub
      </p>
    </main>
  );
}
