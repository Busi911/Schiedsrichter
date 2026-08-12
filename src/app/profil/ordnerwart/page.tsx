import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import {
  holeOrdnerEinsatzZahlen,
  holeOrdnerRelevanteTermine,
  istOrdnerwart,
} from "@/lib/ordnerwart";
import { bedarfFuer } from "@/lib/dienste";
import { ordnerZuordnen, ordnerZuordnungEntfernen } from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LabeledSelect } from "@/components/labeled-select";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { rundenspielTypLabel } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

export default async function OrdnerwartPage() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  if (!(await istOrdnerwart(vereinId, userId))) {
    notFound();
  }

  const [personenListe, termineRoh, verein] = await Promise.all([
    holeOrdnerEinsatzZahlen(vereinId),
    holeOrdnerRelevanteTermine(vereinId),
    withTenant(vereinId, (tx) =>
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
    ),
  ]);

  const belegtProZeitpunktUndTermin = new Map<number, Map<string, string>>();
  for (const termin of termineRoh) {
    const zeitpunkt = termin.start.getTime();
    const map = belegtProZeitpunktUndTermin.get(zeitpunkt) ?? new Map();
    for (const z of termin.zuordnungen) {
      if (
        (["ordner", "kioskdienst"] as const).includes(
          z.funktionstraegerTyp as "ordner" | "kioskdienst"
        ) &&
        z.userId
      ) {
        map.set(z.userId, termin.id);
      }
    }
    belegtProZeitpunktUndTermin.set(zeitpunkt, map);
  }

  const relevanteTermine = termineRoh
    .map((termin) => {
      const luecken = (["ordner", "kioskdienst"] as const)
        .map((rolle) => {
          const bedarf = verein
            ? bedarfFuer(
                verein,
                termin.typ,
                rolle,
                termin.pflichtspiel,
                termin.freundschaftsTyp
              )
            : 0;
          const vorhanden = termin.zuordnungen.filter(
            (z) => z.funktionstraegerTyp === rolle
          ).length;
          return { rolle, bedarf, vorhanden };
        })
        .filter((l) => l.bedarf > 0);

      const belegteAmZeitpunkt =
        belegtProZeitpunktUndTermin.get(termin.start.getTime()) ?? new Map();
      const freiePersonen = personenListe.filter((s) => {
        const belegtBeiTerminId = belegteAmZeitpunkt.get(s.userId);
        return !belegtBeiTerminId || belegtBeiTerminId === termin.id;
      });

      return {
        ...termin,
        luecken,
        vollstaendig: luecken.every((l) => l.vorhanden >= l.bedarf),
        freiePersonen,
      };
    })
    .filter((t) => t.luecken.length > 0)
    .sort((a, b) => Number(a.vollstaendig) - Number(b.vollstaendig));
  const offeneAnzahl = relevanteTermine.filter((t) => !t.vollstaendig).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <h1 className="font-heading text-2xl font-semibold">
          Ordner-/Kioskdienstwart
        </h1>
        <p className="text-sm text-muted-foreground">
          Übersicht über alle Ordner/Kioskdienst-Helfer im Verein und ihre
          Einsätze, sowie Termine mit Ordner-/Kioskdienst-Bedarf. Ordner/
          Kioskdienst melden sich normalerweise selbst an — hier lässt sich
          zusätzlich manuell zuordnen, entfernen oder ersetzen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ordner/Kioskdienst-Helfer im Verein
          </CardTitle>
          <CardDescription>
            Anzahl bereits absolvierter Einsätze (in beiden Rollen
            zusammen).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {personenListe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine aktiven Ordner/Kioskdienst-Helfer im Verein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead className="text-right">Einsätze</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personenListe.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell className="font-medium">
                      {s.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.email}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.anzahlEinsaetze}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Termine ({offeneAnzahl} offen von {relevanteTermine.length})
          </CardTitle>
          <CardDescription>
            Freundschaftsspiele, Turniere und Rundenspiele mit konfiguriertem
            Ordner-/Kioskdienst-Bedarf. Die Auswahl zeigt nur Personen, die
            zu diesem Zeitpunkt nicht bereits an einem anderen Termin
            eingeteilt sind.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {relevanteTermine.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine anstehenden Termine mit Ordner-/Kioskdienst-Bedarf.
            </p>
          ) : (
            relevanteTermine.map((t) => {
              const typLabel =
                t.typ === "rundenspiel"
                  ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                  : (TYP_LABEL[t.typ] ?? t.typ);
              const bestehende = t.zuordnungen.filter((z) =>
                (["ordner", "kioskdienst"] as const).includes(
                  z.funktionstraegerTyp as "ordner" | "kioskdienst"
                )
              );
              const personOptionen = t.freiePersonen.flatMap((s) =>
                t.luecken
                  .filter(
                    (l) =>
                      l.vorhanden < l.bedarf &&
                      s.rollen.includes(l.rolle) &&
                      !bestehende.some(
                        (z) =>
                          z.userId === s.userId &&
                          z.funktionstraegerTyp === l.rolle
                      )
                  )
                  .map((l) => ({
                    value: `${s.userId}|${l.rolle}`,
                    label: `${s.name ?? s.email} (${ROLLE_LABEL[l.rolle]})`,
                  }))
              );

              return (
                <div key={t.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {formatDateTime(t.start)}
                    </span>
                    <Badge variant="outline">{typLabel}</Badge>
                    {t.luecken.map((l) => (
                      <Badge
                        key={l.rolle}
                        variant={l.vorhanden >= l.bedarf ? "secondary" : "outline"}
                      >
                        {ROLLE_LABEL[l.rolle]}: {l.vorhanden}/{l.bedarf}
                      </Badge>
                    ))}
                    {t.ort && (
                      <span className="text-muted-foreground">{t.ort}</span>
                    )}
                  </div>
                  {t.beschreibung && (
                    <p className="mt-1 text-muted-foreground">
                      {t.beschreibung}
                    </p>
                  )}
                  {bestehende.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {bestehende.map((z) => (
                        <li key={z.id}>
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              {ROLLE_LABEL[z.funktionstraegerTyp] ??
                                z.funktionstraegerTyp}
                              : {z.name ?? z.externerName ?? z.email}
                              {z.externerName && !z.email
                                ? " (ohne Login)"
                                : ""}
                            </span>
                            <div className="flex items-center gap-3">
                              {personOptionen.length > 0 && (
                                <details className="group">
                                  <summary className="cursor-pointer list-none text-xs text-muted-foreground underline [&::-webkit-details-marker]:hidden">
                                    <span className="group-open:hidden">
                                      Ersetzen
                                    </span>
                                    <span className="hidden group-open:inline">
                                      Schließen
                                    </span>
                                  </summary>
                                  <form
                                    action={ordnerZuordnen}
                                    className="mt-2 flex flex-wrap items-center gap-2"
                                  >
                                    <input
                                      type="hidden"
                                      name="terminId"
                                      value={t.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="ersetzeZuordnungId"
                                      value={z.id}
                                    />
                                    <div className="min-w-56">
                                      <LabeledSelect
                                        name="personRolle"
                                        placeholder="Ersatz wählen…"
                                        options={personOptionen}
                                        required
                                      />
                                    </div>
                                    <Button type="submit" size="sm" variant="outline">
                                      Ersetzen
                                    </Button>
                                  </form>
                                </details>
                              )}
                              <form action={ordnerZuordnungEntfernen}>
                                <input
                                  type="hidden"
                                  name="zuordnungId"
                                  value={z.id}
                                />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-0 text-xs text-muted-foreground underline"
                                >
                                  Entfernen
                                </Button>
                              </form>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {personOptionen.length === 0 ? (
                    !t.vollstaendig && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Keine Person zu diesem Zeitpunkt verfügbar.
                      </p>
                    )
                  ) : bestehende.length === 0 ? (
                    <form
                      action={ordnerZuordnen}
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="terminId" value={t.id} />
                      <div className="min-w-56">
                        <LabeledSelect
                          name="personRolle"
                          placeholder="Person wählen…"
                          options={personOptionen}
                          required
                        />
                      </div>
                      <Button type="submit" size="sm">
                        Zuordnen
                      </Button>
                    </form>
                  ) : (
                    <details className="group mt-2">
                      <summary className="cursor-pointer list-none text-xs text-muted-foreground underline [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">
                          Weitere Person hinzufügen
                        </span>
                        <span className="hidden group-open:inline">
                          Schließen
                        </span>
                      </summary>
                      <form
                        action={ordnerZuordnen}
                        className="mt-2 flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="terminId" value={t.id} />
                        <div className="min-w-56">
                          <LabeledSelect
                            name="personRolle"
                            placeholder="Person wählen…"
                            options={personOptionen}
                            required
                          />
                        </div>
                        <Button type="submit" size="sm">
                          Weitere zuordnen
                        </Button>
                      </form>
                    </details>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
