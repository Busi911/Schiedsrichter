import { desc, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NeuerVereinDialog } from "@/components/neuer-verein-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDatum as formatDate } from "@/lib/format";

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

      <Card>
        <CardHeader>
          <CardTitle>Alle Vereine</CardTitle>
          <CardAction>
            <NeuerVereinDialog />
          </CardAction>
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
    </div>
  );
}
