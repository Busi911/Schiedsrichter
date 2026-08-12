import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { termine } from "@/db/schema";
import { istTurnierBerechtigt } from "@/lib/turnier-zugriff";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TurnierSpielplan } from "@/components/turnier-spielplan";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

// Eingeschränkte Verwaltung für den Turnierverantwortlichen (siehe
// turnierVerantwortlicherId in db/schema.ts und istTurnierBerechtigt) — nur
// der Spielplan (Spiele anlegen/bearbeiten/löschen, Ergebnisse eintragen),
// keine Termin-Details, kein Löschen des Turniers, kein Link-Regenerieren
// (bleibt Admin-exklusiv über /admin/termine/[id]).
export default async function MeinTurnierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const { id } = await params;

  const [turnier, spiele] = await withTenant(vereinId, async (tx) => {
    const turnier = await tx.query.termine.findFirst({
      where: and(
        eq(termine.id, id),
        eq(termine.vereinId, vereinId),
        eq(termine.typ, "turnier")
      ),
    });
    const spiele = turnier
      ? await tx.query.termine.findMany({
          where: eq(termine.turnierId, id),
          orderBy: (t, { asc }) => [asc(t.start)],
        })
      : [];
    return [turnier, spiele];
  });

  if (!turnier || !istTurnierBerechtigt(turnier, session)) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link
          href="/profil"
          className="text-sm text-muted-foreground underline"
        >
          ← Zurück zu meinem Profil
        </Link>
        <h1 className="font-heading text-2xl font-semibold">
          {turnier.beschreibung ?? "Turnier"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(turnier.start)}
          {turnier.ort ? ` · ${turnier.ort}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spielplan</CardTitle>
          <CardDescription>
            Als Turnierverantwortlicher kannst du Spiele anlegen, bearbeiten,
            löschen und Ergebnisse eintragen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TurnierSpielplan spiele={spiele} turnierId={turnier.id} />
        </CardContent>
      </Card>
    </div>
  );
}
