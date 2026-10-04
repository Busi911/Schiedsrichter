import { requireSystemAdmin } from "@/lib/session";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Liga-Sync</h1>
        <p className="text-sm text-muted-foreground">
          Startet den Liga-Sync von Hand (derselbe wie der stündliche Cron). Er entscheidet je Verein selbst, was fällig
          ist — Mannschaften, die in den letzten 30 Minuten geladen wurden, überspringt er.
        </p>
      </div>
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
