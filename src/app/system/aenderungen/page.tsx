import { desc, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { stammdatenAenderungen, vereine } from "@/db/schema";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AUTOMATISCH_ANWENDBAR, STAMMDATEN_FELDER, type StammdatenFeld } from "@/lib/stammdaten-felder";
import { requireSystemAdmin } from "@/lib/session";
import { antragEntscheiden } from "./actions";

export const dynamic = "force-dynamic";

const datum = (d: Date) => d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

// Anträge der Vereine auf Änderung gesperrter Stammdaten (Vereins-/Team-IDs, Zusatzquellen bei eingetragenen Diensten).
export default async function AenderungenSeite({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  await requireSystemAdmin();
  const { ok, fehler } = await searchParams;
  const zeilen = await adminDb
    .select({ a: stammdatenAenderungen, verein: vereine.name })
    .from(stammdatenAenderungen)
    .innerJoin(vereine, eq(vereine.id, stammdatenAenderungen.vereinId))
    .orderBy(desc(stammdatenAenderungen.erstelltAm))
    .limit(100);
  const offen = zeilen.filter((z) => z.a.status === "offen");
  const erledigt = zeilen.filter((z) => z.a.status !== "offen");

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Änderungsanträge</h1>
        <p className="text-sm text-muted-foreground">
          Sobald für Termine Dienste eingetragen sind (zugeordnet oder selbst eingetragen), sind Vereins-/Team-IDs, weitere Vereine (Spielgemeinschaft) und das Entfernen der Seite gesperrt (Hallen-IDs und Hallennamen nicht mehr, sie löschen nie Termine). Änderungen kommen hier mit Grund an.
          Bei „Genehmigen“ wird der Wert sofort gesetzt (Spiele werden danach vom Cron neu geladen); Felder ohne Automatik musst du von Hand ändern.
        </p>
      </div>
      {ok && <p className="rounded-md border bg-muted p-3 text-sm break-words">{ok}</p>}
      {fehler && <p className="rounded-md border border-destructive p-3 text-sm break-words text-destructive">{fehler}</p>}

      <h2 className="font-heading text-lg font-semibold">Offen ({offen.length})</h2>
      {offen.length === 0 && <p className="text-sm text-muted-foreground">Keine offenen Anträge.</p>}
      {offen.map(({ a, verein }) => {
        const feld = a.feld as StammdatenFeld;
        const auto = AUTOMATISCH_ANWENDBAR.includes(feld);
        return (
          <Card key={a.id}>
            <CardContent className="flex flex-col gap-3 pt-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{verein}</span>
                <span className="text-xs text-muted-foreground">{datum(a.erstelltAm)} · {a.angefragtVon}</span>
              </div>
              <p className="font-medium">{STAMMDATEN_FELDER[feld] ?? a.feld}</p>
              <p className="break-words">
                <span className="text-muted-foreground">Bisher:</span> {a.bisherigerWert || "—"}
                <br />
                <span className="text-muted-foreground">Neu:</span> {a.neuerWert || "—"}
              </p>
              <p className="break-words rounded-md bg-muted/40 p-2">
                <span className="text-muted-foreground">Grund:</span> {a.grund}
              </p>
              {!auto && <p className="text-xs text-muted-foreground">Dieses Feld wird nicht automatisch gesetzt — nach „Genehmigen“ von Hand umsetzen.</p>}
              <form action={antragEntscheiden} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input type="hidden" name="id" value={a.id} />
                <Input name="notiz" placeholder="Hinweis an den Verein (optional)" className="sm:flex-1" />
                <div className="flex gap-2">
                  <ConfirmSubmitButton
                    size="sm"
                    name="entscheidung"
                    value="genehmigen"
                    confirmText={`„${STAMMDATEN_FELDER[feld] ?? a.feld}“ für ${verein} ändern?`}
                  >
                    Genehmigen
                  </ConfirmSubmitButton>
                  <SubmitButton size="sm" variant="outline" name="entscheidung" value="ablehnen">
                    Ablehnen
                  </SubmitButton>
                </div>
              </form>
            </CardContent>
          </Card>
        );
      })}

      {erledigt.length > 0 && (
        <>
          <h2 className="font-heading text-lg font-semibold">Erledigt</h2>
          <ul className="flex flex-col gap-2">
            {erledigt.map(({ a, verein }) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="break-words">
                  {verein} · {STAMMDATEN_FELDER[a.feld as StammdatenFeld] ?? a.feld}: {a.bisherigerWert || "—"} → {a.neuerWert || "—"}
                </span>
                <Badge variant={a.status === "genehmigt" ? "default" : "secondary"}>
                  {a.status === "genehmigt" ? "genehmigt" : "abgelehnt"} {a.entschiedenAm ? datum(a.entschiedenAm) : ""}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
