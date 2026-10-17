import { requireSystemAdmin } from "@/lib/session";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { holeAlleSeiten } from "@/lib/handball-net/sync";
import { parsePhasen } from "@/lib/handball-net/modell";
import { istErlaubterApiPfad, maskiereHnetJson, schluesselPfade } from "@/lib/handball-net/diagnose";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const maxDuration = 60;

// Diagnose der handball.net-API (nur Systemadmin, nur lesend, nur auf Knopfdruck, schreibt nichts): zeigt für ein Spiel die ROHE,
// maskierte Antwort der Spielliste (welche Status-/Spielstand-Felder gibt es?) und kann EINEN weiteren /api/-Pfad abrufen, den der
// Browser auf der Spielseite (Tab LIVETICKER, Netzwerk-Tab) nachweislich benutzt. Es wird kein Endpunkt geraten oder durchprobiert.
// Hinweis: Die Zustimmung des DHB gilt dem Abruf von Spielplänen/Ergebnissen. Diese Seite ruft nur von Hand einzelne Antworten ab.
type Params = { team?: string; spiel?: string; pfad?: string };

const Block = ({ titel, children }: { titel: string; children: React.ReactNode }) => (
  <div className="rounded-lg border p-3">
    <p className="mb-2 text-sm font-medium">{titel}</p>
    {children}
  </div>
);
const Pre = ({ children }: { children: string }) => (
  <pre className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-xs break-all whitespace-pre-wrap">{children}</pre>
);

export default async function HandballNetDiagnosePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireSystemAdmin();
  const { team = "", spiel = "", pfad = "" } = await searchParams;
  const teamId = team.trim();
  const spielId = spiel.trim();
  const apiPfad = pfad.trim();

  const bloecke: { titel: string; inhalt: string; pfade?: string[] }[] = [];
  const fehler: string[] = [];

  if (/^\d+$/.test(teamId) && /^\d+$/.test(spielId)) {
    try {
      const jetzt = new Date();
      const von = `${jetzt.getFullYear() - 1}-07-01`;
      const bis = `${jetzt.getFullYear() + 1}-06-30`;
      const wettbewerbe = await holeHandballNetApi(`/api/new/teams/${teamId}/competitions`);
      const roh = (wettbewerbe as { data?: unknown })?.data ?? wettbewerbe;
      const phasen = parsePhasen(roh);
      bloecke.push({ titel: `Wettbewerbe von Team ${teamId}: ${phasen.length}`, inhalt: phasen.map((p) => `${p.id} · ${p.competitionName} · ${p.name}`).join("\n") || "keine" });
      let gefunden = false;
      for (const phase of phasen.slice(0, 6)) {
        const liste = await holeAlleSeiten(holeHandballNetApi, `/api/new/matches?team_id=${teamId}&phase_id=${encodeURIComponent(phase.id)}&date_from=${von}&date_to=${bis}`);
        const treffer = liste.find((m) => String((m as { id?: unknown })?.id) === spielId);
        if (treffer) {
          gefunden = true;
          bloecke.push({
            titel: `Spiel ${spielId} in Phase ${phase.id} (${phase.name})`,
            inhalt: JSON.stringify(maskiereHnetJson(treffer), null, 2).slice(0, 12000),
            pfade: schluesselPfade(treffer),
          });
          break;
        }
      }
      if (!gefunden) fehler.push(`Spiel ${spielId} in keiner der Phasen von Team ${teamId} gefunden.`);
    } catch (err) {
      fehler.push(`Abruf fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (apiPfad) {
    if (!istErlaubterApiPfad(apiPfad)) {
      fehler.push("Pfad nicht erlaubt: nur /api/…-Pfade, ohne Host, ohne „..“.");
    } else {
      try {
        const antwort = await holeHandballNetApi(apiPfad);
        bloecke.push({
          titel: `GET ${apiPfad}`,
          inhalt: JSON.stringify(maskiereHnetJson(antwort), null, 2).slice(0, 12000),
          pfade: schluesselPfade(antwort),
        });
      } catch (err) {
        fehler.push(`GET ${apiPfad}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">handball.net-Diagnose</h1>
        <p className="text-sm text-muted-foreground">
          Zeigt, welche Felder die handball.net-API für ein Spiel wirklich liefert (Status, Spielstand, Hinweise auf den Liveticker).
          Nur lesend, nur auf Knopfdruck. Personendaten (Schiedsrichter, Zeitnehmer, Kontakte) werden ausgeblendet.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spiel prüfen</CardTitle>
          <CardDescription>
            Team-ID und Spiel-ID stehen in der Adresse der handball.net-Seiten (…/team/86819, …/match/392196).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team">Team-ID (eine der beiden Mannschaften)</Label>
              <Input id="team" name="team" inputMode="numeric" defaultValue={teamId} placeholder="z. B. 86819" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spiel">Spiel-ID</Label>
              <Input id="spiel" name="spiel" inputMode="numeric" defaultValue={spielId} placeholder="z. B. 392196" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pfad">Optional: ein /api/-Pfad aus dem Netzwerk-Tab des Browsers (Tab LIVETICKER)</Label>
              <Input id="pfad" name="pfad" defaultValue={apiPfad} placeholder="/api/…" />
            </div>
            <SubmitButton pendingText="Ruft ab …" className="self-start">
              Abrufen
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
      {fehler.map((f) => (
        <p key={f} className="rounded-md border border-destructive p-3 text-sm break-words text-destructive">
          {f}
        </p>
      ))}
      {bloecke.map((b) => (
        <Block key={b.titel} titel={b.titel}>
          {b.pfade && (
            <details className="mb-2">
              <summary className="min-h-11 cursor-pointer text-sm">Felder ({b.pfade.length})</summary>
              <Pre>{b.pfade.join("\n")}</Pre>
            </details>
          )}
          <Pre>{b.inhalt}</Pre>
        </Block>
      ))}
    </div>
  );
}
