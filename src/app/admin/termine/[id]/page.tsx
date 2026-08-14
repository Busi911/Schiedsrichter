import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, termine, users } from "@/db/schema";
import { turnierLinkErneuern } from "../../actions";
import { appUrl } from "@/lib/app-url";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TerminBearbeitenDialog } from "@/components/termin-bearbeiten-dialog";
import { TurnierSpielplan } from "@/components/turnier-spielplan";

export default async function TerminBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { id } = await params;

  const [termin, mannschaftsListe, spiele, trainerListe] = await withTenant(
    vereinId,
    async (tx) => {
      const termin = await tx.query.termine.findFirst({
        where: and(eq(termine.id, id), eq(termine.vereinId, vereinId)),
      });
      const mannschaftsListe = await tx.query.mannschaften.findMany({
        where: eq(mannschaften.vereinId, vereinId),
        orderBy: (m, { asc }) => [asc(m.name)],
      });
      const spiele =
        termin?.typ === "turnier"
          ? await tx.query.termine.findMany({
              where: eq(termine.turnierId, id),
              orderBy: (t, { asc }) => [asc(t.start)],
            })
          : [];
      // Kandidaten für "Turnierverantwortlicher" — funktionstraeger_rolle ist
      // per RLS ohnehin auf den eigenen Verein beschränkt (siehe
      // 0001_enable_rls_multi_tenant.sql), daher hier kein zusätzlicher
      // Join-Filter nötig.
      const trainerListe =
        termin?.typ === "turnier"
          ? await tx
              .select({ userId: users.id, name: users.name, email: users.email })
              .from(funktionstraegerRollen)
              .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
              .where(
                and(
                  eq(funktionstraegerRollen.typ, "trainer"),
                  eq(funktionstraegerRollen.aktiv, true)
                )
              )
              .orderBy(users.name)
          : [];
      return [termin, mannschaftsListe, spiele, trainerListe];
    }
  );

  if (!termin || termin.quelle !== "manuell") {
    notFound();
  }

  const istTurnier = termin.typ === "turnier";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/termine"
            className="text-sm text-muted-foreground underline"
          >
            ← Zurück zu Termine
          </Link>
          <h1 className="font-heading text-2xl font-semibold">
            {termin.beschreibung || (istTurnier ? "Turnier" : "Termin")}
          </h1>
        </div>
        <TerminBearbeitenDialog
          termin={termin}
          mannschaftsListe={mannschaftsListe}
          trainerListe={trainerListe}
          istTurnier={istTurnier}
        />
      </div>

      {istTurnier && (
        <>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Öffentlicher Link</CardTitle>
              <CardDescription>
                Wer den Link kennt, sieht den Spielplan dieses Turniers —
                ganz ohne Login, rein lesend. Ideal zum Teilen mit anderen
                Vereinen oder Eltern.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="break-all rounded-lg border bg-muted/40 p-3 text-sm">
                {termin.freigabeToken
                  ? `${appUrl()}/turnier/${termin.freigabeToken}`
                  : "Kein Link vorhanden."}
              </p>
              <form action={turnierLinkErneuern}>
                <input type="hidden" name="turnierId" value={termin.id} />
                <Button type="submit" variant="outline" size="sm">
                  Link neu generieren (alter Link wird ungültig)
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spielplan</CardTitle>
              <CardDescription>
                Einzelspiele dieses Turniers — jedes kann separat
                Schiedsrichter/Zeitnehmer/Sekretär zugeordnet bekommen (siehe
                Zuordnung).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TurnierSpielplan
                spiele={spiele}
                turnierId={termin.id}
                turnierOrt={termin.ort}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
