import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, gte, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { bedarfFuer } from "@/lib/dienste";
import { ORDNER_ROLLEN } from "@/lib/ordnerwart";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { tagKey } from "@/lib/kalender";
import { rundenspielTypLabel } from "@/lib/termin-label";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { LinkSpinner } from "@/components/link-spinner";
import {
  TerminMehrfachAuswahl,
  type EintragbarerTermin,
} from "@/components/mehrfachauswahl";
import { ordnerSelbstEintragenMehrfachOeffentlich } from "./actions";
import { formatDatumZeit as formatDateTime, formatWochentagDatum } from "@/lib/format";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  rundenspiel: "Rundenspiel",
};

const ORDNER_ROLLE_LABEL: Record<string, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

const ORDNER_ROLLE_OPTIONEN = [
  { value: "ordner", label: "Ordner" },
  { value: "kioskdienst", label: "Kioskdienst" },
];

// Ordner-/Kioskdienst-Bedarf gilt für den Turnier-CONTAINER selbst (typ =
// turnier), nicht für dessen Einzelspiele — siehe Kommentar in
// lib/ordnerwart.ts. Anders als bei Zeitnehmer/Sekretär deshalb "turnier"
// statt "turnier_spiel" in dieser Liste.
const ORDNER_RELEVANTE_TYPEN = ["testspiel", "turnier", "rundenspiel"];

// Öffentliche, login-freie Selbsteintragung für Ordner/Kioskdienst (siehe
// vereine.ordnerSelbstanmeldungToken, vom Ordnerwart aktivierbar) — analog
// zu /zeitnehmer-eintragen/[token], siehe dortige Kommentare für die
// Grundprinzipien.
export default async function OrdnerEintragenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mannschaft?: string }>;
}) {
  const { token } = await params;
  const { mannschaft: mannschaftFilter } = await searchParams;

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.ordnerSelbstanmeldungToken, token),
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
        ORDNER_RELEVANTE_TYPEN.includes(t.typ)
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
                // Nur Ordner/Kioskdienst anzeigen — sonst würden z.B.
                // Schiedsrichter-Zuordnungen desselben Termins hier
                // mitgeladen und fälschlich gelabelt (das Label unten kennt
                // nur diese beiden Rollen).
                inArray(terminZuordnungen.funktionstraegerTyp, ORDNER_ROLLEN)
              )
            )
        : [];

      const relevanteTermine = relevante
        .map((t) => {
          const eigeneZuordnungen = zuordnungen.filter((z) => z.terminId === t.id);
          const luecken = ORDNER_ROLLEN.map((rolle) => ({
            rolle,
            bedarf: bedarfFuer(verein, t.typ, rolle, t.pflichtspiel, t.freundschaftsTyp),
            vorhanden: eigeneZuordnungen.filter((z) => z.funktionstraegerTyp === rolle)
              .length,
          })).filter((l) => l.bedarf > 0);
          return {
            ...t,
            zuordnungen: eigeneZuordnungen,
            luecken,
            vollstaendig: luecken.every((l) => l.vorhanden >= l.bedarf),
          };
        })
        // Ohne diesen Filter blieben Termine ohne jeden Ordner-/Kioskdienst-
        // Bedarf (luecken leer) trotzdem sichtbar UND fälschlich als "voll"
        // markiert (every() auf leerem Array ist true).
        .filter((t) => t.luecken.length > 0);

      return { alleMannschaften, relevanteTermine };
    }
  );

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
    vollstaendig: t.vollstaendig,
    eintragbar: !t.vollstaendig,
    zuordnungen: t.zuordnungen.map((z) => ({
      id: z.id,
      label: `${ORDNER_ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}: ${z.name ?? z.externerName ?? "—"}`,
    })),
  }));

  const offeneAnzahl = gefilterteTermine.filter((t) => !t.vollstaendig).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Logo className="size-8 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {verein.name}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            Als Ordner/Kioskdienst eintragen
          </h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Kein Login nötig: einen oder mehrere Termine auswählen, Namen
        eintragen, Rolle wählen und absenden. Bereits im System angelegte
        Personen werden dabei automatisch erkannt — bei Unsicherheit prüft
        das der Ordnerwart nach.
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
        <TerminMehrfachAuswahl
          token={token}
          termine={eintragbareTermine}
          rolleOptionen={ORDNER_ROLLE_OPTIONEN}
          submitAction={ordnerSelbstEintragenMehrfachOeffentlich}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">
        Selbsteintragung — HandballerPate
      </p>
    </main>
  );
}
