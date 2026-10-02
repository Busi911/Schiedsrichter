import { requireSystemAdmin } from "@/lib/session";
import { pruefeMailKonfiguration } from "@/lib/mail-diagnose";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { testMailSenden } from "../actions";

export default async function MailTestPage({
  searchParams,
}: {
  searchParams: Promise<{ gesendet?: string; fehler?: string }>;
}) {
  const session = await requireSystemAdmin();
  const { gesendet, fehler } = await searchParams;
  const d = await pruefeMailKonfiguration();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Mail-Test</h1>
        <p className="text-sm text-muted-foreground">
          Testmail senden und die Absender-Einstellungen prüfen, wenn Mails im Spam landen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Testmail senden</CardTitle>
          <CardDescription>
            Geht über denselben Weg wie die Login- und Erinnerungsmails. Prüf dann Posteingang oder Spam und im Header
            („Original anzeigen“) die Zeilen SPF, DKIM und DMARC.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {gesendet && (
            <p className="rounded-md border border-green-600/40 bg-green-600/10 p-2 text-sm">
              Testmail an <strong>{gesendet}</strong> übergeben. Sie kommt meist innerhalb einer Minute an — schau auch im Spam-Ordner.
            </p>
          )}
          {fehler && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">{fehler}</p>}
          <form action={testMailSenden} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="empfaenger">Empfänger</Label>
              <Input
                id="empfaenger"
                name="empfaenger"
                type="email"
                required
                defaultValue={session.user.email ?? ""}
                placeholder="z.B. deine Gmail-/Web.de-Adresse"
              />
            </div>
            <SubmitButton pendingText="Sendet…">Testmail senden</SubmitButton>
          </form>
          <p className="text-xs text-muted-foreground">
            Tipp: Sende sie nacheinander an mehrere Anbieter (Gmail, Web.de/GMX, Outlook/Hotmail) — Spamfilter entscheiden
            unterschiedlich. Zusätzlich kannst du die Mail an die Adresse von mail-tester.com schicken, dort gibt es eine Bewertung.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Absender-Einstellungen</CardTitle>
          <CardDescription>Gelesen aus der Konfiguration und den DNS-Einträgen der Absenderdomain.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">SMTP-Server</dt>
            <dd>{d.host ? `${d.host}:${d.port}` : "nicht gesetzt"}</dd>
            <dt className="text-muted-foreground">Absender</dt>
            <dd className="[overflow-wrap:anywhere]">{d.absender ?? "nicht gesetzt"}</dd>
            <dt className="text-muted-foreground">Absenderdomain</dt>
            <dd>{d.absenderDomain ?? "—"}</dd>
            <dt className="text-muted-foreground">SPF</dt>
            <dd className="[overflow-wrap:anywhere]">
              {d.spf ? <code className="text-xs">{d.spf}</code> : <Badge variant="destructive">fehlt</Badge>}
            </dd>
            <dt className="text-muted-foreground">DMARC</dt>
            <dd className="[overflow-wrap:anywhere]">
              {d.dmarc ? <code className="text-xs">{d.dmarc}</code> : <Badge variant="destructive">fehlt</Badge>}
            </dd>
            <dt className="text-muted-foreground">DKIM</dt>
            <dd>
              {d.dkim.some((x) => x.vorhanden) ? (
                <>gefunden unter: {d.dkim.filter((x) => x.vorhanden).map((x) => x.selektor).join(", ")}</>
              ) : (
                <span className="text-muted-foreground">unter üblichen Selektoren nicht gefunden (im Mail-Header prüfen)</span>
              )}
            </dd>
            <dt className="text-muted-foreground">MX</dt>
            <dd className="[overflow-wrap:anywhere]">{d.mx.length > 0 ? d.mx.join(", ") : "kein Eintrag"}</dd>
          </dl>
          {d.hinweise.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <p className="font-medium">Das könnte der Grund sein:</p>
              <ul className="list-disc space-y-1 pl-5">
                {d.hinweise.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground">An den DNS-Einträgen fällt nichts auf. Entscheidend ist dann das Ergebnis der Testmail.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
