import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, termine, users } from "@/db/schema";
import {
  deleteTermin,
  turnierLinkErneuern,
  updateTermin,
} from "../../actions";
import { appUrl } from "@/lib/app-url";
import { toDatetimeLocalWert } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
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
      <div>
        <Link
          href="/admin/termine"
          className="text-sm text-muted-foreground underline"
        >
          ← Zurück zu Termine
        </Link>
        <h1 className="font-heading text-2xl font-semibold">
          {istTurnier ? "Turnier bearbeiten" : "Termin bearbeiten"}
        </h1>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={updateTermin} className="flex flex-col gap-4">
            <input type="hidden" name="terminId" value={termin.id} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="typ">Typ</Label>
              <LabeledSelect
                id="typ"
                name="typ"
                defaultValue={termin.typ}
                required
                options={[
                  { value: "testspiel", label: "Freundschaftsspiel" },
                  { value: "turnier", label: "Turnier" },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="start">
                {istTurnier ? "Beginn" : "Start"}
              </Label>
              <Input
                id="start"
                name="start"
                type="datetime-local"
                defaultValue={toDatetimeLocalWert(termin.start)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ende">
                {istTurnier ? "Ende (optional)" : "Ende (optional)"}
              </Label>
              <Input
                id="ende"
                name="ende"
                type="datetime-local"
                defaultValue={termin.ende ? toDatetimeLocalWert(termin.ende) : ""}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ort">Ort</Label>
              <Input id="ort" name="ort" defaultValue={termin.ort ?? ""} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="beschreibung">
                {istTurnier ? "Titel" : "Beschreibung / Gegner"}
              </Label>
              <Input
                id="beschreibung"
                name="beschreibung"
                defaultValue={termin.beschreibung ?? ""}
                placeholder={istTurnier ? "z.B. Sommerturnier 2026" : undefined}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="mannschaftId">Mannschaft (optional)</Label>
              <LabeledSelect
                id="mannschaftId"
                name="mannschaftId"
                placeholder="—"
                defaultValue={termin.mannschaftId ?? undefined}
                options={mannschaftsListe.map((m) => ({
                  value: m.id,
                  label: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
                }))}
              />
            </div>

            {istTurnier && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="turnierVerantwortlicherId">
                  Turnierverantwortlicher (optional)
                </Label>
                <LabeledSelect
                  id="turnierVerantwortlicherId"
                  name="turnierVerantwortlicherId"
                  placeholder="— (nur Admin verwaltet)"
                  defaultValue={termin.turnierVerantwortlicherId ?? undefined}
                  options={trainerListe.map((t) => ({
                    value: t.userId,
                    label: t.name ?? t.email,
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Darf zusätzlich zum Admin diesen Spielplan pflegen und
                  Ergebnisse eintragen (unter &quot;Meine Termine&quot;).
                </p>
              </div>
            )}

            <Button type="submit" className="w-full">
              Speichern
            </Button>
          </form>

          <form action={deleteTermin}>
            <input type="hidden" name="terminId" value={termin.id} />
            <Button type="submit" variant="destructive" className="w-full">
              {istTurnier ? "Turnier löschen" : "Termin löschen"}
            </Button>
          </form>
        </CardContent>
      </Card>

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
              <TurnierSpielplan spiele={spiele} turnierId={termin.id} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
