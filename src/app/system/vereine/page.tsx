import { desc, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users, vereine } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { vereinErstellen } from "./actions";
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

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(d);
}

export default async function SystemVereinePage() {
  await requireSystemAdmin();

  // Bewusst adminDb (privilegiert, RLS-frei): der Systemadmin muss
  // vereinsübergreifend sehen können — das ist genau seine Aufgabe.
  const alleVereine = await adminDb.query.vereine.findMany({
    orderBy: (v) => [desc(v.erstelltAm)],
  });
  const admins = await adminDb
    .select({ vereinId: users.vereinId, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.istAdmin, true));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Vereine</h1>
        <p className="text-sm text-muted-foreground">
          Alle Vereine im System verwalten.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Alle Vereine</CardTitle>
          </CardHeader>
          <CardContent>
            {alleVereine.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Vereine angelegt.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Angelegt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alleVereine.map((v) => {
                    const admin = admins.find((a) => a.vereinId === v.id);
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.name}</TableCell>
                        <TableCell>
                          {admin ? (admin.name ?? admin.email) : "—"}
                        </TableCell>
                        <TableCell>{formatDate(v.erstelltAm)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Neuer Verein</CardTitle>
            <CardDescription>
              Legt den Verein und dessen ersten Admin-Account an.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={vereinErstellen} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="vereinsname">Vereinsname</Label>
                <Input id="vereinsname" name="vereinsname" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adminName">Name des Admins</Label>
                <Input id="adminName" name="adminName" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adminEmail">E-Mail des Admins</Label>
                <Input id="adminEmail" name="adminEmail" type="email" required />
              </div>
              <Button type="submit" className="w-full">
                Verein anlegen
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
