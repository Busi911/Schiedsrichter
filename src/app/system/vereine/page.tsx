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
import { VereinVorbereitenDialog } from "@/components/verein-vorbereiten-dialog";
import { VereinUebergebenDialog } from "@/components/verein-uebergeben-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { supportFreigabeAktiv } from "@/lib/treuhand";
import { treuhandStarten } from "./actions";
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
          <CardAction className="flex gap-2">
            <VereinVorbereitenDialog />
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
                  <TableHead>Status</TableHead>
                  <TableHead>Angelegt</TableHead>
                  <TableHead>Zugriff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alleVereine.map((v) => {
                  const vereinsAdmins = admins.filter((a) => a.vereinId === v.id);
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>
                        {vereinsAdmins.length > 0
                          ? vereinsAdmins.map((a) => a.name ?? a.email).join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {v.status === "vorbereitung" ? (
                          <Badge variant="outline">In Vorbereitung</Badge>
                        ) : (
                          <Badge variant="secondary">Aktiv</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(v.erstelltAm)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {v.status === "vorbereitung" ? (
                            <>
                              <form action={treuhandStarten}>
                                <input type="hidden" name="vereinId" value={v.id} />
                                <SubmitButton size="sm" variant="outline" pendingText="Öffnet…">
                                  Einrichten
                                </SubmitButton>
                              </form>
                              <VereinUebergebenDialog vereinId={v.id} vereinName={v.name} />
                            </>
                          ) : supportFreigabeAktiv(v.supportZugriffBis) ? (
                            <form action={treuhandStarten} className="flex items-center gap-2">
                              <input type="hidden" name="vereinId" value={v.id} />
                              <SubmitButton size="sm" variant="outline" pendingText="Öffnet…">
                                Support-Zugriff
                              </SubmitButton>
                              <span className="text-xs text-muted-foreground">
                                freigegeben bis {formatDate(v.supportZugriffBis)}
                              </span>
                            </form>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              kein Zugriff
                            </span>
                          )}
                        </div>
                      </TableCell>
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
