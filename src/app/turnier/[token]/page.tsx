import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { adminDb } from "@/db/admin";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

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

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Spielplan</CardTitle>
        </CardHeader>
        <CardContent>
          {spiele.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Der Spielplan steht noch nicht fest.
            </p>
          ) : (
            <div className="flex flex-col divide-y">
              {spiele.map((s) => {
                const besetzung = alleZuordnungen.filter(
                  (z) => z.terminId === s.id
                );
                return (
                  <div key={s.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="font-medium">
                        {formatDateTime(s.start)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {s.ort ?? "—"}
                      </span>
                    </div>
                    <p className="text-sm">{s.beschreibung ?? "—"}</p>
                    {besetzung.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        Besetzung noch offen
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {besetzung.map((z) => (
                          <Badge
                            key={`${z.terminId}-${z.funktionstraegerTyp}-${z.email ?? z.externerName}`}
                            variant="secondary"
                          >
                            {ROLLE_LABEL[z.funktionstraegerTyp] ??
                              z.funktionstraegerTyp}
                            : {z.name ?? z.externerName ?? z.email}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Rein lesende Ansicht — FunktionsträgerHub
      </p>
    </main>
  );
}
