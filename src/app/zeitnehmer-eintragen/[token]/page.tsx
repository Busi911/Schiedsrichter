import { and, eq, gte, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { bedarfFuer } from "@/lib/dienste";
import { berechneBesetzung } from "@/lib/besetzung";
import { rundenspielTypLabel } from "@/lib/termin-label";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { zeitnehmerSelbstEintragenOeffentlich } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabeledSelect } from "@/components/labeled-select";
import { Logo } from "@/components/logo";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Bewusst ohne spiel_ics (persönlicher ICS-Einsatz des Schiedsrichters,
// keine Mannschafts-/Vereins-Veranstaltung) — anders als auf
// /profil/zeitnehmerwart, wo der Wart auch dafür manuell zuordnen kann.
const ZEITNEHMER_RELEVANTE_TYPEN = ["testspiel", "turnier_spiel", "rundenspiel"];

const ROLLE_OPTIONEN = [
  { value: "zeitnehmer", label: "Zeitnehmer" },
  { value: "sekretaer", label: "Sekretär" },
];

const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;

// Öffentliche, login-freie Selbsteintragung für Zeitnehmer/Sekretär (siehe
// vereine.zeitnehmerSelbstanmeldungToken, vom Zeitnehmerwart aktivierbar) —
// analog zur öffentlichen Turnier-Ansicht (/turnier/[token]), aber mit
// Schreibzugriff statt nur Lesen.
export default async function ZeitnehmerEintragenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mannschaft?: string }>;
}) {
  const { token } = await params;
  const { mannschaft: mannschaftFilter } = await searchParams;

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.zeitnehmerSelbstanmeldungToken, token),
  });
  if (!verein) {
    notFound();
  }

  const { alleMannschaften, relevanteTermine } = await withTenant(
    verein.id,
    async (tx) => {
      const alleMannschaften = await tx.query.mannschaften.findMany({
        where: eq(mannschaften.vereinId, verein.id),
        orderBy: (m, { asc }) => [asc(m.name)],
      });

      const terminListe = await tx.query.termine.findMany({
        where: and(eq(termine.vereinId, verein.id), gte(termine.start, new Date())),
        orderBy: (t, { asc }) => [asc(t.start)],
      });
      const relevante = terminListe.filter((t) =>
        ZEITNEHMER_RELEVANTE_TYPEN.includes(t.typ)
      );

      const terminIds = relevante.map((t) => t.id);
      const zuordnungen = terminIds.length
        ? await tx
            .select({
              id: terminZuordnungen.id,
              terminId: terminZuordnungen.terminId,
              funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
              name: users.name,
              externerName: terminZuordnungen.externerName,
            })
            .from(terminZuordnungen)
            .leftJoin(users, eq(terminZuordnungen.userId, users.id))
            .where(
              and(
                inArray(terminZuordnungen.terminId, terminIds),
                // Nur Zeitnehmer/Sekretär anzeigen — sonst würden z.B.
                // Schiedsrichter-Zuordnungen desselben Termins hier
                // mitgeladen und fälschlich als "Sekretär" gelabelt (das
                // Label unten kennt nur diese beiden Rollen).
                inArray(terminZuordnungen.funktionstraegerTyp, ZEITNEHMER_ROLLEN)
              )
            )
        : [];

      const relevanteTermine = relevante
        .map((t) => {
          const eigeneZuordnungen = zuordnungen.filter((z) => z.terminId === t.id);
          const zeitnehmerBedarf = bedarfFuer(
            verein,
            t.typ,
            "zeitnehmer",
            t.pflichtspiel,
            t.freundschaftsTyp
          );
          return {
            ...t,
            zeitnehmerBedarf,
            zuordnungen: eigeneZuordnungen,
            besetzung: berechneBesetzung(
              eigeneZuordnungen,
              false,
              zeitnehmerBedarf,
              verein.zeitnehmerSekretaerMax
            ),
          };
        })
        // Ohne diesen Filter blieb ein Termin mit Bedarf 0 (z.B. Freundschafts-
        // spiele/Turniere, für die der Verein gar keinen Zeitnehmer/Sekretär
        // braucht, siehe /admin/einstellungen) trotzdem sichtbar UND
        // eintragbar: "voll" prüfte bisher nur gegen die globale Obergrenze
        // (zeitnehmerSekretaerMax), nicht gegen den tatsächlichen Bedarf.
        .filter((t) => t.zeitnehmerBedarf > 0);

      return { alleMannschaften, relevanteTermine };
    }
  );

  const gefilterteTermine = mannschaftFilter
    ? relevanteTermine.filter((t) => t.mannschaftId === mannschaftFilter)
    : relevanteTermine;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Logo className="size-8 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {verein.name}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            Als Zeitnehmer/Sekretär eintragen
          </h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Kein Login nötig: Termin auswählen, Namen eintragen, Rolle wählen und
        absenden. Bereits im System angelegte Personen werden dabei
        automatisch erkannt — bei Unsicherheit prüft das der Zeitnehmerwart
        nach.
      </p>

      {alleMannschaften.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={!mannschaftFilter ? "default" : "outline"}
            size="sm"
            render={<Link href="?" />}
            nativeButton={false}
          >
            Alle
          </Button>
          {alleMannschaften.map((m) => (
            <Button
              key={m.id}
              variant={mannschaftFilter === m.id ? "default" : "outline"}
              size="sm"
              render={<Link href={`?mannschaft=${m.id}`} />}
              nativeButton={false}
            >
              {m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {gefilterteTermine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine anstehenden Termine.
          </p>
        ) : (
          gefilterteTermine.map((t) => {
            const typLabel =
              t.typ === "rundenspiel"
                ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                : (TYP_LABEL[t.typ] ?? t.typ);
            return (
              <Card key={t.id} className="min-w-0">
                <CardContent className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{formatDateTime(t.start)}</span>
                    <Badge variant="outline">{typLabel}</Badge>
                    <Badge
                      variant={
                        t.besetzung.zeitnehmerSekretaerErfuellt
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {t.besetzung.zeitnehmerSekretaerErfuellt
                        ? "Besetzung vollständig"
                        : "Besetzung offen"}
                    </Badge>
                    {t.ort && (
                      <span className="text-muted-foreground">{t.ort}</span>
                    )}
                  </div>
                  {t.beschreibung && (
                    <p className="text-muted-foreground">{t.beschreibung}</p>
                  )}
                  {t.zuordnungen.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.zuordnungen.map((z) => (
                        <Badge key={z.id} variant="secondary">
                          {z.funktionstraegerTyp === "zeitnehmer"
                            ? "Zeitnehmer"
                            : "Sekretär"}
                          : {z.name ?? z.externerName ?? "—"}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {!t.besetzung.zeitnehmerSekretaerVoll && (
                    <form
                      action={zeitnehmerSelbstEintragenOeffentlich}
                      className="mt-1 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="terminId" value={t.id} />
                      <Input
                        name="name"
                        placeholder="Dein Name"
                        required
                        className="h-8 min-w-48 flex-1"
                      />
                      <div className="w-36">
                        <LabeledSelect
                          name="rolle"
                          placeholder="Rolle…"
                          options={ROLLE_OPTIONEN}
                          required
                        />
                      </div>
                      <Button type="submit" size="sm">
                        Eintragen
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Selbsteintragung — HandballerPate
      </p>
    </main>
  );
}
