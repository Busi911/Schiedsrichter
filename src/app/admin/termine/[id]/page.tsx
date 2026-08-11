import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, termine } from "@/db/schema";
import { deleteTermin, updateTermin } from "../../actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default async function TerminBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { id } = await params;

  const [termin, mannschaftsListe] = await withTenant(vereinId, async (tx) => {
    const termin = await tx.query.termine.findFirst({
      where: and(eq(termine.id, id), eq(termine.vereinId, vereinId)),
    });
    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    });
    return [termin, mannschaftsListe];
  });

  if (!termin || termin.quelle !== "manuell") {
    notFound();
  }

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
          Termin bearbeiten
        </h1>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
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
                  { value: "testspiel", label: "Testspiel" },
                  { value: "turnier", label: "Turnier" },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="start">Start</Label>
              <Input
                id="start"
                name="start"
                type="datetime-local"
                defaultValue={toDatetimeLocal(termin.start)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ende">Ende (optional)</Label>
              <Input
                id="ende"
                name="ende"
                type="datetime-local"
                defaultValue={termin.ende ? toDatetimeLocal(termin.ende) : ""}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ort">Ort</Label>
              <Input id="ort" name="ort" defaultValue={termin.ort ?? ""} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="beschreibung">Beschreibung / Gegner</Label>
              <Input
                id="beschreibung"
                name="beschreibung"
                defaultValue={termin.beschreibung ?? ""}
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
                  label: m.name,
                }))}
              />
            </div>

            <Button type="submit" className="w-full">
              Speichern
            </Button>
          </form>

          <form action={deleteTermin} className="mt-4">
            <input type="hidden" name="terminId" value={termin.id} />
            <Button type="submit" variant="destructive" className="w-full">
              Termin löschen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
