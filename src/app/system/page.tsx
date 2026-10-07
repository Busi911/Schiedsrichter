import { count, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users, warteliste } from "@/db/schema";
import { zahlungsStand } from "@/lib/abrechnung";
import { requireSystemAdmin } from "@/lib/session";
import { holeSystemEinstellungen, zaehleVereineFuerBetaLimit } from "@/lib/system-einstellungen";
import { betaVereinLimitSpeichern } from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { formatDatum as formatDate } from "@/lib/format";

export default async function SystemDashboardPage() {
  await requireSystemAdmin();

  // Bewusst adminDb (privilegiert, RLS-frei): der Systemadmin braucht
  // vereinsübergreifende Zahlen — das ist genau seine Aufgabe.
  const [
    [{ value: vereineCount }],
    [{ value: nutzerCount }],
    [{ value: aktiveRollenCount }],
    [{ value: wartelisteCount }],
    neuesteVereine,
    systemEinstellungenZeile,
  ] = await Promise.all([
    zaehleVereineFuerBetaLimit().then((value) => [{ value }]),
    adminDb.select({ value: count() }).from(users).where(isNotNull(users.vereinId)),
    adminDb
      .select({ value: count() })
      .from(funktionstraegerRollen)
      .where(eq(funktionstraegerRollen.aktiv, true)),
    adminDb.select({ value: count() }).from(warteliste),
    adminDb.query.vereine.findMany({
      orderBy: (v) => [desc(v.erstelltAm)],
      limit: 5,
    }),
    holeSystemEinstellungen(),
  ]);

  const admins = await adminDb
    .select({ vereinId: users.vereinId, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.istAdmin, true));

  // Zahlungen: was braucht jetzt Aufmerksamkeit (siehe /system/abrechnung)?
  const jetzt = new Date();
  const staende = (await adminDb.query.vereine.findMany()).map((v) => zahlungsStand(v, jetzt).art);
  const zahlungDringend = staende.filter((a) => a === "gesperrt" || a === "ueberfaellig").length;
  const zahlungBald = staende.filter((a) => a === "bald_faellig").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">
          Vereinsübergreifende Kennzahlen über alle Mandanten.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-base">Zahlungen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold">{zahlungDringend + zahlungBald}</p>
            <Link href="/system/abrechnung" className="mt-1 inline-block text-xs text-muted-foreground underline">
              {zahlungDringend > 0 ? `${zahlungDringend} überfällig/gesperrt, ` : ""}
              {zahlungBald} bald fällig — zur Abrechnung
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

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Registrierung: Vereinslimit</CardTitle>
          <CardDescription>
            Vereine können sich unter /registrieren selbst anlegen, bis
            diese Grenze erreicht ist — danach landen weitere Anfragen auf
            der{" "}
            <Link href="/system/warteliste" className="underline">
              Warteliste ({wartelisteCount})
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={betaVereinLimitSpeichern} className="flex items-end gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="betaVereinLimit">Maximale Vereinsanzahl</Label>
              <Input
                id="betaVereinLimit"
                name="betaVereinLimit"
                type="number"
                min={0}
                defaultValue={systemEinstellungenZeile.betaVereinLimit}
                className="w-24"
              />
            </div>
            <SubmitButton variant="outline">Speichern</SubmitButton>
          </form>
        </CardContent>
      </Card>

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
