import { desc, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { produktFeedback, users, vereine } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDatumZeit } from "@/lib/format";

// "Antworten" öffnet das eigene Mailprogramm mit Empfänger, Betreff und der zitierten Rückmeldung (mailto, kein Versand über
// die App). Zitat gekürzt, damit der Link nicht zu lang wird (manche Mailprogramme schneiden lange mailto-Links ab).
function antwortLink(e: { personEmail: string; personName: string | null; nachricht: string }): string {
  const zitat = e.nachricht.length > 600 ? `${e.nachricht.slice(0, 600)} …` : e.nachricht;
  const body = [
    `Hallo${e.personName ? ` ${e.personName}` : ""},`,
    "",
    "",
    "",
    "Ihre Nachricht:",
    ...zitat.split("\n").map((z) => `> ${z}`),
  ].join("\n");
  const params = new URLSearchParams({ subject: "Ihr Feedback zu HandballerPate", body });
  // URLSearchParams kodiert Leerzeichen als "+", Mailprogramme erwarten %20.
  return `mailto:${e.personEmail}?${params.toString().replace(/\+/g, "%20")}`;
}

export default async function SystemFeedbackPage() {
  await requireSystemAdmin();

  // Bewusst adminDb (privilegiert, RLS-frei): Feedback wird vereinsübergreifend
  // ausgewertet, siehe gleiches Prinzip in /system/vereine.
  const eintraege = await adminDb
    .select({
      id: produktFeedback.id,
      nachricht: produktFeedback.nachricht,
      seite: produktFeedback.seite,
      erstelltAm: produktFeedback.erstelltAm,
      vereinName: vereine.name,
      personName: users.name,
      personEmail: users.email,
    })
    .from(produktFeedback)
    .innerJoin(vereine, eq(produktFeedback.vereinId, vereine.id))
    .innerJoin(users, eq(produktFeedback.userId, users.id))
    .orderBy(desc(produktFeedback.erstelltAm));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Rückmeldungen aus dem Feedback-Button im Header, vereinsübergreifend.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alle Rückmeldungen</CardTitle>
          <CardDescription>Neueste zuerst.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {eintraege.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch kein Feedback eingegangen.
            </p>
          ) : (
            eintraege.map((e) => (
              <div key={e.id} className="rounded-lg border p-3 text-sm">
                <p className="whitespace-pre-wrap">{e.nachricht}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDatumZeit(e.erstelltAm)} · {e.vereinName} ·{" "}
                  {e.personName ?? e.personEmail} · Seite: {e.seite}
                </p>
                <a
                  href={antwortLink(e)}
                  className="mt-1 inline-flex min-h-11 items-center text-sm font-medium underline"
                >
                  Antworten
                </a>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
