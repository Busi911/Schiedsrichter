import { count, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users, vereine } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function SystemDashboardPage() {
  await requireSystemAdmin();

  // Bewusst adminDb (privilegiert, RLS-frei): der Systemadmin braucht
  // vereinsübergreifende Zahlen — das ist genau seine Aufgabe.
  const [
    [{ value: vereineCount }],
    [{ value: nutzerCount }],
    [{ value: aktiveRollenCount }],
    neuesteVereine,
  ] = await Promise.all([
    adminDb.select({ value: count() }).from(vereine),
    adminDb.select({ value: count() }).from(users).where(isNotNull(users.vereinId)),
    adminDb
      .select({ value: count() })
      .from(funktionstraegerRollen)
      .where(eq(funktionstraegerRollen.aktiv, true)),
    adminDb.query.vereine.findMany({
      orderBy: (v) => [desc(v.erstelltAm)],
      limit: 5,
    }),
  ]);

  const admins = await adminDb
    .select({ vereinId: users.vereinId, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.istAdmin, true));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">
          Vereinsübergreifende Kennzahlen über alle Mandanten.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vereine</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold">{vereineCount}</p>
            <Link
              href="/system/vereine"
              className="mt-1 inline-block text-xs text-muted-foreground underline"
            >
              Alle Vereine verwalten
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nutzer</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold">{nutzerCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Über alle Vereine hinweg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktive Funktionsträger-Rollen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold">
              {aktiveRollenCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Eine Person kann mehrere Rollen haben
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zuletzt angelegte Vereine</CardTitle>
        </CardHeader>
        <CardContent>
          {neuesteVereine.length === 0 ? (
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
                {neuesteVereine.map((v) => {
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
