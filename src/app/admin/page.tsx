import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import {
  formatMannschaft,
  holeLetzteErgebnisse,
  holeUnbesetzteTermine,
} from "@/lib/dashboard";
import { berechneGesamtbilanz, holeMannschaftsBilanzen } from "@/lib/dienste-statistik";
import { parseMonatParam } from "@/lib/kalender";
import { holeAdminKalenderDaten } from "@/lib/admin-kalender";
import { holeOffeneSelbsteintragungen } from "@/lib/offene-selbsteintragungen";
import { ordnerVorschlagBestaetigen } from "@/app/profil/ordnerwart/actions";
import {
  zeitnehmerInaktiveRolleAktivierenUndZuordnen,
  zeitnehmerVorschlagBestaetigen,
} from "@/app/profil/zeitnehmerwart/actions";
import { MonatsKalender } from "@/components/monats-kalender";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PersonSelect } from "@/components/person-select";
import { SubmitButton } from "@/components/submit-button";
import { UnbesetzteTermineTabelle } from "@/components/dashboard-tabellen";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { formatErgebnis, rundenspielTypLabel } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Bei rundenspiel-Terminen ist beschreibung = [titel, kategorie, spielArt,
// zusatz].join(" · ") (siehe rundenspiel-import.ts) — titel (Heim –
// Auswärts) und kategorie zeigt die Mannschaft-Spalte hier schon per
// formatMannschaft an, daher als Untertitel nur den Rest (Spielart inkl.
// Spielnummer, plus Zusatz wie z.B. das nuLiga-Schiedsrichter-Kürzel), damit
// die Zeile nicht doppelt Mannschaft/Kategorie ausweist.
function kuerzeBeschreibung(t: {
  typ: string;
  beschreibung: string | null;
  kategorie: string | null;
}): string | null {
  if (t.typ !== "rundenspiel" || !t.beschreibung) return t.beschreibung;
  const rest = t.beschreibung
    .split(" · ")
    .slice(1)
    .filter((teil) => teil !== t.kategorie);
  return rest.length ? rest.join(" · ") : null;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { monat } = await searchParams;
  const { jahr, monatNull } = parseMonatParam(monat);

  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
  );

  const [
    unbesetzteTermine,
    letzteErgebnisse,
    mannschaftsBilanzen,
    kalenderDaten,
    offeneSelbsteintragungen,
  ] = await Promise.all([
    // Wie "Letzte Ergebnisse" auf 10 begrenzt — für die volle Liste gibt es
    // den Link "Alle Termine" unten.
    holeUnbesetzteTermine(vereinId, 10),
    holeLetzteErgebnisse(vereinId, 10),
    // Ungekappt (anders als letzteErgebnisse oben) — die Saison-KPIs unten
    // sollen die echte Gesamtbilanz zeigen, nicht nur die der letzten 10
    // angezeigten Ergebnisse.
    holeMannschaftsBilanzen(vereinId),
    // Derselbe Monatskalender wie auf /admin/kalender, hier direkt unter
    // den KPI-Kacheln eingebettet — "alles Wichtige auf einen Blick" statt
    // extra dorthin navigieren zu müssen.
    holeAdminKalenderDaten(vereinId, jahr, monatNull),
    // Über die öffentliche Selbsteintragung erfasste Personen, die noch
    // keiner angelegten Person zugeordnet wurden — Ordner/Kioskdienst/
    // Kassierer UND Zeitnehmer/Sekretär zusammen, statt zwischen den beiden
    // Wart-Seiten wechseln zu müssen (siehe lib/offene-selbsteintragungen.ts).
    holeOffeneSelbsteintragungen(vereinId),
  ]);
  const { spiele: gesamtSpiele, siegquote } = berechneGesamtbilanz(mannschaftsBilanzen);

  const unbesetzteTermineZeilen = unbesetzteTermine.map((t) => ({
    terminId: t.terminId,
    zeit: formatDateTime(t.start),
    typLabel: t.typLabel,
    ort: t.ort,
    mannschaft: t.mannschaftLabel,
    schiriOffen: t.schiriOffen,
    zeitnehmerOffen: t.zeitnehmerOffen,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">
          {verein?.name ?? "Verein"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Rundenspiele mit Ergebnis</CardDescription>
            <CardTitle className="text-3xl">{gesamtSpiele}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Siegquote (alle Mannschaften)</CardDescription>
            <CardTitle className="text-3xl">
              {siegquote !== null ? `${siegquote}%` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {offeneSelbsteintragungen.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Selbsteintragungen zum Bestätigen (
              {offeneSelbsteintragungen.length})
            </CardTitle>
            <CardDescription>
              Über die öffentlichen Selbsteintragungs-Links erfasst (Ordner/
              Kioskdienst/Kassierer sowie Zeitnehmer/Sekretär zusammen), noch
              keiner angelegten Person zugeordnet. Vorausgewählt ist der
              beste automatische Namens-Vorschlag, falls vorhanden — bei
              Bedarf vor dem Bestätigen korrigieren.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {offeneSelbsteintragungen.map((z) => (
              <div key={z.id} className="rounded-lg border p-3 text-sm">
                <p>
                  <span className="font-medium">{z.externerName}</span> als{" "}
                  {z.rolleLabel} · {formatDateTime(z.termin.start)}
                  {z.termin.beschreibung ? ` · ${z.termin.beschreibung}` : ""}
                </p>
                {session.user.istAdmin ? (
                  z.kandidaten.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Keine passende Person im Verein angelegt — auf{" "}
                      <Link
                        href={
                          z.bereich === "ordner"
                            ? "/profil/ordnerwart"
                            : "/profil/zeitnehmerwart"
                        }
                        className="underline"
                      >
                        {z.bereich === "ordner"
                          ? "der Ordnerwart-Seite"
                          : "der Zeitnehmerwart-Seite"}
                      </Link>{" "}
                      lässt sich stattdessen direkt eine neue Person anlegen.
                    </p>
                  ) : (
                    <form
                      action={
                        z.bereich === "ordner"
                          ? ordnerVorschlagBestaetigen
                          : zeitnehmerVorschlagBestaetigen
                      }
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="zuordnungId" value={z.id} />
                      <div className="min-w-56">
                        <PersonSelect
                          name="userId"
                          placeholder="Person wählen…"
                          defaultValue={z.matchVorschlagUserId ?? undefined}
                          options={z.kandidaten}
                          required
                        />
                      </div>
                      <SubmitButton size="sm">Bestätigen</SubmitButton>
                    </form>
                  )
                ) : null}
                {session.user.istAdmin && z.inaktivVorschlag && (
                  <form
                    action={zeitnehmerInaktiveRolleAktivierenUndZuordnen}
                    className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2"
                  >
                    <input type="hidden" name="zuordnungId" value={z.id} />
                    <input
                      type="hidden"
                      name="rolleId"
                      value={z.inaktivVorschlag.rolleId}
                    />
                    <p className="text-xs text-muted-foreground">
                      Ähnlich:{" "}
                      <span className="font-medium text-foreground">
                        {z.inaktivVorschlag.name ?? z.inaktivVorschlag.email}
                      </span>{" "}
                      — als {z.rolleLabel} aktuell inaktiv.
                    </p>
                    <ConfirmSubmitButton
                      confirmText={`${z.inaktivVorschlag.name ?? z.inaktivVorschlag.email} aktivieren und dieser Zuordnung zuordnen?`}
                      size="xs"
                      variant="outline"
                    >
                      Aktivieren &amp; zuordnen
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kalender</CardTitle>
        </CardHeader>
        <CardContent>
          <MonatsKalender
            jahr={jahr}
            monatNull={monatNull}
            eintraegeProTag={kalenderDaten.eintraegeProTag}
            mehrtaegigeEintraege={kalenderDaten.mehrtaegigeEintraege}
            mannschaftsListe={kalenderDaten.mannschaftsListe}
            trainerListe={kalenderDaten.trainerListe}
            zuordenbarePersonen={kalenderDaten.zuordenbarePersonen}
            basisPfad="/admin"
            schreibzugriff={session.user.istAdmin}
          />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unbesetzte Termine</CardTitle>
            <CardDescription>
              Nächste Termine, denen noch Schiedsrichter und/oder Zeitnehmer/
              Sekretär fehlen — der Kalender oben zeigt bereits alle Termine,
              hier interessiert nur noch die offene Besetzung.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {unbesetzteTermineZeilen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Alle anstehenden Termine sind vollständig besetzt.
              </p>
            ) : (
              <UnbesetzteTermineTabelle termine={unbesetzteTermineZeilen} />
            )}
            <Link
              href="/admin/kalender"
              className="mt-1 text-xs text-muted-foreground underline"
            >
              Alle Termine
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Letzte Ergebnisse</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {letzteErgebnisse.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Ergebnisse erfasst.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Termin</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Mannschaft</TableHead>
                    <TableHead>Ergebnis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {letzteErgebnisse.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {formatDateTime(t.start)}
                        {kuerzeBeschreibung(t) && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {kuerzeBeschreibung(t)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t.typ === "rundenspiel"
                            ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                            : (TYP_LABEL[t.typ] ?? t.typ)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatMannschaft(t) ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
