import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, users } from "@/db/schema";
import {
  AUSWERTUNG_ROLLEN,
  AUSWERTUNG_ROLLE_LABEL,
  holeTermineFuerAuswertung,
  rollenZellenWert,
} from "@/lib/termin-auswertung";
import { tagKey } from "@/lib/kalender";
import { AlleAuswaehlenCheckbox } from "@/components/alle-auswaehlen-checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { rundenspielTypLabel } from "@/lib/termin-label";

// Ohne spiel_ics — siehe TERMIN_TYPEN in termin-auswertung.ts, das diese
// Termine grundsätzlich ausschließt.
const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Nur für die Vorschau unten auf dieser Seite — der Export (Excel/PDF, siehe
// export/excel|pdf/route.ts) fragt unabhängig davon und ohne Limit erneut
// über denselben Filter ab, deckt also immer den kompletten gewählten
// Zeitraum ab, egal wie viele Zeilen hier angezeigt werden.
const VORSCHAU_LIMIT = 20;

export default async function AuswertungPage({
  searchParams,
}: {
  searchParams: Promise<{
    von?: string;
    bis?: string;
    typ?: string;
    schiedsrichterId?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const filter = await searchParams;
  // Deckt sich mit dem Default in holeTermineFuerAuswertung (dort greift er
  // serverseitig auch ohne explizites "von" in der URL) — hier nur, damit das
  // Datumsfeld den tatsächlich angewandten Wert zeigt statt leer zu wirken.
  const heute = tagKey(new Date());

  const [termineRoh, schiedsrichterListe] = await Promise.all([
    // +1 statt genau VORSCHAU_LIMIT, um zu erkennen, ob noch mehr Termine
    // existieren, ohne dafür eine zweite (COUNT-)Abfrage zu brauchen.
    holeTermineFuerAuswertung(vereinId, filter, VORSCHAU_LIMIT + 1),
    withTenant(vereinId, (tx) =>
      tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(eq(funktionstraegerRollen.typ, "schiedsrichter"))
    ),
  ]);
  const gibtWeitere = termineRoh.length > VORSCHAU_LIMIT;
  const termineListe = termineRoh.slice(0, VORSCHAU_LIMIT);

  return (
    // EIN gemeinsames Formular für Filter, Zeilen-Auswahl und alle drei
    // Buttons (Filtern/Excel/PDF, siehe formAction unten) — bei einer nativen
    // GET-Übermittlung landen automatisch alle Filterfelder UND die
    // angehakten "terminId"-Checkboxen im Query-String der jeweiligen Route.
    // Ohne Auswahl (kein Häkchen gesetzt) exportieren Excel/PDF weiterhin
    // die komplette gefilterte Liste wie bisher (siehe export/excel|pdf/
    // route.ts).
    <form method="get" className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          Auswertung &amp; Export
        </h1>
        <p className="text-sm text-muted-foreground">
          Gesamter Dienstplan mit allen besetzten Rollen (Schiedsrichter,
          Ordner, Kioskdienst, Kassierer, Zeitnehmer, Sekretär) — filterbar
          und als Excel/PDF exportierbar. Standardmäßig alle Termine ab heute
          ohne Enddatum; einzelne Zeilen und Rollen lassen sich unten für den
          Export gezielt auswählen.
        </p>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="von">Von</Label>
              <Input
                id="von"
                name="von"
                type="date"
                defaultValue={filter.von || heute}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bis">Bis</Label>
              <Input id="bis" name="bis" type="date" defaultValue={filter.bis} />
            </div>
            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="typ">Typ</Label>
              <LabeledSelect
                id="typ"
                name="typ"
                defaultValue={filter.typ ?? undefined}
                placeholder="Alle"
                options={Object.entries(TYP_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
            <div className="flex w-56 flex-col gap-1.5">
              <Label htmlFor="schiedsrichterId">Schiedsrichter</Label>
              <LabeledSelect
                id="schiedsrichterId"
                name="schiedsrichterId"
                defaultValue={filter.schiedsrichterId ?? undefined}
                placeholder="Alle"
                options={schiedsrichterListe.map((s) => ({
                  value: s.id,
                  label: s.name ?? s.email,
                }))}
              />
            </div>
            <Button type="submit" variant="outline">
              Filtern
            </Button>
            <Button type="submit" formAction="/admin/auswertung/export/excel">
              Als Excel exportieren
            </Button>
            <Button
              type="submit"
              variant="outline"
              formAction="/admin/auswertung/export/pdf"
            >
              Als PDF exportieren
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label>Rollen für Excel/PDF</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {AUSWERTUNG_ROLLEN.map((r) => (
                <label key={r} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="rolle"
                    value={r}
                    className="size-4 accent-primary"
                  />
                  {AUSWERTUNG_ROLLE_LABEL[r]}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Ohne Auswahl werden alle Rollen exportiert.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Termine</CardTitle>
          {gibtWeitere && (
            <p className="text-sm text-muted-foreground">
              Zeigt die ersten {VORSCHAU_LIMIT} Termine — Excel/PDF-Export
              enthält trotzdem immer den kompletten gewählten Zeitraum.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {termineListe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Termine für die gewählten Filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-0">
                    <AlleAuswaehlenCheckbox
                      name="terminId"
                      label="Alle Termine auswählen"
                    />
                  </TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Mannschaft</TableHead>
                  <TableHead>Schiedsrichter</TableHead>
                  <TableHead>Ordner</TableHead>
                  <TableHead>Kioskdienst</TableHead>
                  <TableHead>Kassierer</TableHead>
                  <TableHead>Zeitnehmer</TableHead>
                  <TableHead>Sekretär</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {termineListe.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        name="terminId"
                        value={t.id}
                        aria-label={`${formatDateTime(t.start)} auswählen`}
                        className="size-4 accent-primary"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatDateTime(t.start)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t.typ === "rundenspiel"
                          ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                          : TYP_LABEL[t.typ] ?? t.typ}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.ort ?? "—"}</TableCell>
                    <TableCell>{t.beschreibung ?? "—"}</TableCell>
                    <TableCell>{t.mannschaftName ?? "—"}</TableCell>
                    <TableCell>{t.schiedsrichterName ?? "—"}</TableCell>
                    <TableCell>
                      {rollenZellenWert(t.ordnerName, t.rollenBedarf?.ordner, "—")}
                    </TableCell>
                    <TableCell>
                      {rollenZellenWert(t.kioskdienstName, t.rollenBedarf?.kioskdienst, "—")}
                    </TableCell>
                    <TableCell>
                      {rollenZellenWert(t.kassiererName, t.rollenBedarf?.kassierer, "—")}
                    </TableCell>
                    <TableCell>
                      {rollenZellenWert(t.zeitnehmerName, t.rollenBedarf?.zeitnehmer, "—")}
                    </TableCell>
                    <TableCell>
                      {rollenZellenWert(t.sekretaerName, t.rollenBedarf?.sekretaer, "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
