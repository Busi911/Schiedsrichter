import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { adminDb } from "@/db/admin";
import { ligaExterneIdentitaeten, ligaGruppen, ligaTabellenzeilen, ligaVereine } from "@/db/schema";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSystemAdmin } from "@/lib/session";
import { diagnostiziereHbl } from "@/lib/sources/hbl/diagnose";
import { HBL_WETTBEWERBE, type HblWettbewerb } from "@/lib/sources/match";
import { hblJetztLaden, hblTeamLoesen, hblTeamZuordnen } from "./actions";

export const maxDuration = 60;

const LIGEN: HblWettbewerb[] = ["hbl1", "hbl2"];
const norm = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "");

// Verein-Vorschlag zu einem HBL-Teamnamen: gleicher Name, sonst der eine Verein, dessen Name im Teamnamen steckt (oder umgekehrt).
function schlageVor(teamName: string, vereine: { id: string; name: string }[]): string | null {
  const t = norm(teamName);
  const gleich = vereine.filter((v) => norm(v.name) === t);
  if (gleich.length === 1) return gleich[0].id;
  const teil = vereine.filter((v) => norm(v.name).length >= 5 && (t.includes(norm(v.name)) || norm(v.name).includes(t)));
  return teil.length === 1 ? teil[0].id : null;
}

export default async function HblSeite({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string; diagnose?: string }> }) {
  await requireSystemAdmin();
  const { ok, fehler, diagnose } = await searchParams;
  const diag = diagnose === "hbl1" || diagnose === "hbl2" ? await diagnostiziereHbl(diagnose) : null;

  const gruppen = await adminDb.select().from(ligaGruppen).where(eq(ligaGruppen.quelle, "hbl")).orderBy(desc(ligaGruppen.nuligaGroupId));
  const aktuell = new Map<string, (typeof gruppen)[number]>();
  for (const g of gruppen) {
    const liga = g.nuligaGroupId.split(":")[0];
    if (!aktuell.has(liga)) aktuell.set(liga, g);
  }
  const zeilen = aktuell.size
    ? await adminDb.select().from(ligaTabellenzeilen).where(inArray(ligaTabellenzeilen.gruppeId, [...aktuell.values()].map((g) => g.id)))
    : [];
  const identitaeten = await adminDb
    .select({ teamId: ligaExterneIdentitaeten.externeId, name: ligaVereine.name })
    .from(ligaExterneIdentitaeten)
    .innerJoin(ligaVereine, eq(ligaVereine.id, ligaExterneIdentitaeten.ligaVereinId))
    .where(eq(ligaExterneIdentitaeten.quelle, "hbl"));
  const vereinJeTeam = new Map(identitaeten.map((i) => [i.teamId, i.name]));
  const vereine = await adminDb.select({ id: ligaVereine.id, name: ligaVereine.name }).from(ligaVereine).orderBy(ligaVereine.name);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">HBL (1. und 2. Handball-Bundesliga)</h1>
        <p className="text-sm text-muted-foreground">
          Dritte Datenquelle neben nuLiga und handball.net, aus den öffentlichen Seiten der HBL (HTML). Ein HBL-Team wird einem
          bestehenden Verein zugeordnet — es entsteht nie automatisch ein neuer Verein. Mannschaft, Tabelle und Spiele erscheinen dann
          auf der Vereinsseite wie alle anderen. Alle 15 Minuten tagsüber (Cron), solange mindestens ein Team zugeordnet ist.
        </p>
      </div>

      {ok && <p className="rounded-md border bg-muted p-3 text-sm break-words">{ok}</p>}
      {fehler && <p className="rounded-md border border-destructive p-3 text-sm break-words text-destructive">{fehler}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jetzt laden</CardTitle>
          <CardDescription>
            Lädt Tabelle und Spielplan (auch ohne Zuordnung, damit die Teams unten erscheinen). Dauert bis ca. 50 Sekunden — nicht doppelt klicken.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={hblJetztLaden} className="flex flex-wrap items-center gap-3">
            <select name="liga" className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm" aria-label="Liga">
              <option value="">1. und 2. HBL</option>
              {LIGEN.map((l) => (
                <option key={l} value={l}>
                  {HBL_WETTBEWERBE[l].kurz}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="teams" value="1" defaultChecked /> mit Teamübersicht (Logos)
            </label>
            <SubmitButton pendingText="Lädt …">Jetzt laden</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {LIGEN.map((liga) => {
        const g = aktuell.get(liga);
        const teams = g ? zeilen.filter((z) => z.gruppeId === g.id).sort((a, b) => a.rang - b.rang) : [];
        return (
          <Card key={liga}>
            <CardHeader>
              <CardTitle className="text-base">{HBL_WETTBEWERBE[liga].name}</CardTitle>
              <CardDescription>
                {g ? `Saison ${g.saison} · ${teams.length} Teams in der Tabelle` : "Noch nicht geladen — oben „Jetzt laden“."}{" "}
                <Link href={`/system/hbl?diagnose=${liga}`} className="underline">
                  Diagnose
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {teams.map((t) => {
                const verein = vereinJeTeam.get(t.nuligaTeamtableId);
                const vorschlag = verein ? null : schlageVor(t.name, vereine);
                return (
                  <div key={t.id} className="flex flex-col gap-2 border-b pb-3 text-sm last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {t.rang}. {t.name}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{t.nuligaTeamtableId.slice(0, 8)}…</span>
                    </div>
                    {verein ? (
                      <form action={hblTeamLoesen} className="flex flex-wrap items-center justify-between gap-2">
                        <input type="hidden" name="teamId" value={t.nuligaTeamtableId} />
                        <span>
                          → Verein <strong>{verein}</strong>
                        </span>
                        <ConfirmSubmitButton size="sm" variant="outline" confirmText={`Zuordnung von „${t.name}“ lösen? Mannschaft und Spiele dieses Teams werden entfernt.`}>
                          Lösen
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <form action={hblTeamZuordnen} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="teamId" value={t.nuligaTeamtableId} />
                        <input type="hidden" name="name" value={t.name} />
                        <select name="ligaVereinId" defaultValue={vorschlag ?? ""} required className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm" aria-label={`Verein für ${t.name}`}>
                          <option value="" disabled>
                            Verein wählen …
                          </option>
                          {vereine.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                        <SubmitButton size="sm" variant="outline">
                          Zuordnen
                        </SubmitButton>
                        {vorschlag && <span className="w-full text-xs text-muted-foreground">Vorschlag nach Namen — bitte prüfen.</span>}
                      </form>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {diag && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnose {HBL_WETTBEWERBE[diagnose as HblWettbewerb].kurz}</CardTitle>
            <CardDescription>
              Nur lesend. Zeigt je Seite, was der Parser erkennt, plus Auszüge des HTML. Die Parser sind nur gegen nachgebaute Seiten geprüft — bei ✕
              bitte den Auszug weitergeben.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {diag.map((d) => (
              <div key={d.name} className="flex flex-col gap-1.5 text-sm">
                <p className="font-medium">
                  {d.fehler ? "✕" : "✓"} {d.name} <span className="font-mono text-xs font-normal break-all text-muted-foreground">{d.url}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.ms} ms · {d.zeichen ?? "—"} Zeichen
                </p>
                {d.fehler && <p className="break-words text-destructive">{d.fehler}</p>}
                {d.ergebnis.length > 0 && (
                  <ul className="list-disc pl-5 text-xs break-words">
                    {d.ergebnis.map((z, i) => (
                      <li key={i}>{z}</li>
                    ))}
                  </ul>
                )}
                {d.auszuege.map((a) => (
                  <details key={a.titel} className="text-xs">
                    <summary className="cursor-pointer">{a.titel}</summary>
                    <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted p-2 break-all whitespace-pre-wrap">{a.html}</pre>
                  </details>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
