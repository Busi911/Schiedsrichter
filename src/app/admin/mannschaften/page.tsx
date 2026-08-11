import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften } from "@/db/schema";
import { createMannschaft } from "../actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function MannschaftenPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const liste = await withTenant(vereinId, (tx) =>
    tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Mannschaften</h1>
        <p className="text-sm text-muted-foreground">
          Mannschaften des Vereins verwalten.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Alle Mannschaften</CardTitle>
          </CardHeader>
          <CardContent>
            {liste.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Mannschaften angelegt.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Altersklasse</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liste.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.altersklasse ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Neue Mannschaft</CardTitle>
            <CardDescription>Team anlegen</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createMannschaft} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="altersklasse">Altersklasse (optional)</Label>
                <Input id="altersklasse" name="altersklasse" />
              </div>
              <Button type="submit" className="w-full">
                Anlegen
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
