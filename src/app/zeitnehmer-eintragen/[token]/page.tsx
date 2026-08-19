import { and, eq, gte, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { bedarfFuer } from "@/lib/dienste";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { berechneBesetzung } from "@/lib/besetzung";
import { tagKey } from "@/lib/kalender";
import { rundenspielTypLabel } from "@/lib/termin-label";
import {
  formatDatumZeit as formatDateTime,
  formatWochentagDatum,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { LinkSpinner } from "@/components/link-spinner";
import {
  ZeitnehmerMehrfachAuswahl,
  type EintragbarerTermin,
} from "@/components/zeitnehmer-mehrfachauswahl";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Bewusst ohne spiel_ics (persönlicher ICS-Einsatz des Schiedsrichters,
// keine Mannschafts-/Vereins-Veranstaltung) — anders als auf
// /profil/zeitnehmerwart, wo der Wart auch dafür manuell zuordnen kann.
const ZEITNEHMER_RELEVANTE_TYPEN = ["testspiel", "turnier_spiel", "rundenspiel"];

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
      const alleMannschaften = sortiereMannschaften(
        await tx.query.mannschaften.findMany({
          where: eq(mannschaften.vereinId, verein.id),
        })
      );

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
            t.freundschaftsTyp,
            t.zeitnehmerBedarfOverride
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

  // Nur Mannschaften als Filter-Buttons anbieten, die auch mindestens einen
  // eintragbaren Termin haben — sonst führte ein Klick nur zu "Keine
  // anstehenden Termine" (z.B. wenn die Saison einer Mannschaft schon vorbei
  // ist oder gerade Pause ist).
  const mannschaftenMitTerminen = new Set(
    relevanteTermine.map((t) => t.mannschaftId).filter((id): id is string => !!id)
  );
  const anzeigbareMannschaften = alleMannschaften.filter((m) =>
    mannschaftenMitTerminen.has(m.id)
  );

  const gefilterteTermine = mannschaftFilter
    ? relevanteTermine.filter((t) => t.mannschaftId === mannschaftFilter)
    : relevanteTermine;

  const eintragbareTermine: EintragbarerTermin[] = gefilterteTermine.map((t) => ({
    id: t.id,
    zeit: formatDateTime(t.start),
    tag: tagKey(t.start),
    tagLabel: formatWochentagDatum(t.start),
    typLabel:
      t.typ === "rundenspiel"
        ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
        : (TYP_LABEL[t.typ] ?? t.typ),
    ort: t.ort,
    beschreibung: t.beschreibung,
    vollstaendig: t.besetzung.zeitnehmerSekretaerErfuellt,
    eintragbar: !t.besetzung.zeitnehmerSekretaerVoll,
    zuordnungen: t.zuordnungen.map((z) => ({
      id: z.id,
      label: `${z.funktionstraegerTyp === "zeitnehmer" ? "Zeitnehmer" : "Sekretär"}: ${z.name ?? z.externerName ?? "—"}`,
    })),
  }));

  const offeneAnzahl = gefilterteTermine.filter(
    (t) => !t.besetzung.zeitnehmerSekretaerErfuellt
  ).length;

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
        Kein Login nötig: einen oder mehrere Termine auswählen, Namen
        eintragen, Rolle wählen und absenden. Bereits im System angelegte
        Personen werden dabei automatisch erkannt — bei Unsicherheit prüft
        das der Zeitnehmerwart nach.
      </p>

      {gefilterteTermine.length > 0 && (
        <p className="text-sm font-medium">
          {offeneAnzahl} von {gefilterteTermine.length}{" "}
          {gefilterteTermine.length === 1 ? "Termin" : "Terminen"} noch nicht
          vollständig besetzt
        </p>
      )}

      {anzeigbareMannschaften.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={!mannschaftFilter ? "default" : "outline"}
            size="sm"
            render={<Link href="?" />}
            nativeButton={false}
          >
            Alle
            <LinkSpinner />
          </Button>
          {anzeigbareMannschaften.map((m) => (
            <Button
              key={m.id}
              variant={mannschaftFilter === m.id ? "default" : "outline"}
              size="sm"
              render={<Link href={`?mannschaft=${m.id}`} />}
              nativeButton={false}
            >
              {m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name}
              <LinkSpinner />
            </Button>
          ))}
        </div>
      )}

      {gefilterteTermine.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine anstehenden Termine.
        </p>
      ) : (
        <ZeitnehmerMehrfachAuswahl token={token} termine={eintragbareTermine} />
      )}

      <p className="text-center text-xs text-muted-foreground">
        Selbsteintragung — HandballerPate
      </p>
    </main>
  );
}
