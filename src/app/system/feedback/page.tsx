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
import { SubmitButton } from "@/components/submit-button";
import { formatDatumZeit } from "@/lib/format";
import { Textarea } from "@/components/ui/textarea";
import { feedbackBeantworten, feedbackErledigtSetzen } from "./actions";

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

export default async function SystemFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  await requireSystemAdmin();
  const { ok, fehler } = await searchParams;

  // Bewusst adminDb (privilegiert, RLS-frei): Feedback wird vereinsübergreifend
  // ausgewertet, siehe gleiches Prinzip in /system/vereine.
  const eintraege = await adminDb
    .select({
      id: produktFeedback.id,
      nachricht: produktFeedback.nachricht,
      seite: produktFeedback.seite,
      erstelltAm: produktFeedback.erstelltAm,
      erledigtAm: produktFeedback.erledigtAm,
      vereinName: vereine.name,
      personName: users.name,
      personEmail: users.email,
    })
    .from(produktFeedback)
    .innerJoin(vereine, eq(produktFeedback.vereinId, vereine.id))
    .innerJoin(users, eq(produktFeedback.userId, users.id))
    .orderBy(desc(produktFeedback.erstelltAm));

  const offen = eintraege.filter((e) => !e.erledigtAm);
  const erledigt = eintraege.filter((e) => e.erledigtAm);

  const Eintrag = ({ e }: { e: (typeof eintraege)[number] }) => (
    <div className="rounded-lg border p-3 text-sm">
      <p className="whitespace-pre-wrap">{e.nachricht}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatDatumZeit(e.erstelltAm)} · {e.vereinName} · {e.personName ?? e.personEmail} · Seite: {e.seite}
        {e.erledigtAm && ` · erledigt am ${formatDatumZeit(e.erledigtAm)}`}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4">
        <form action={feedbackErledigtSetzen}>
          <input type="hidden" name="id" value={e.id} />
          <input type="hidden" name="erledigt" value={e.erledigtAm ? "0" : "1"} />
          <SubmitButton variant="outline" size="sm" pendingText="Speichert …">
            {e.erledigtAm ? "Wieder öffnen" : "Als erledigt markieren"}
          </SubmitButton>
        </form>
      </div>
      <details className="mt-2 rounded-lg border bg-muted/30">
        <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-medium">Antworten</summary>
        <form action={feedbackBeantworten} className="flex flex-col gap-2 px-3 pb-3">
          <input type="hidden" name="id" value={e.id} />
          <Textarea name="antwort" rows={5} required placeholder={`Antwort an ${e.personName ?? e.personEmail}`} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="erledigt" defaultChecked className="size-4" />
            Danach als erledigt markieren
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <SubmitButton pendingText="Sendet …" className="self-start">
              Antwort senden
            </SubmitButton>
            <a href={antwortLink(e)} className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline">
              Stattdessen im Mailprogramm öffnen
            </a>
          </div>
        </form>
      </details>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Rückmeldungen aus dem Feedback-Button im Header, vereinsübergreifend.
        </p>
      </div>

      {ok && <p className="rounded-md border bg-muted p-3 text-sm break-words">{ok}</p>}
      {fehler && <p className="rounded-md border border-destructive p-3 text-sm break-words text-destructive">{fehler}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Offen ({offen.length})</CardTitle>
          <CardDescription>Neueste zuerst.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {offen.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {eintraege.length === 0 ? "Noch kein Feedback eingegangen." : "Alles erledigt."}
            </p>
          ) : (
            offen.map((e) => <Eintrag key={e.id} e={e} />)
          )}
        </CardContent>
      </Card>

      {erledigt.length > 0 && (
        <details className="rounded-xl border">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium">Erledigt ({erledigt.length})</summary>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {erledigt.map((e) => (
              <Eintrag key={e.id} e={e} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
