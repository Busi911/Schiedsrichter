import { adminDb } from "@/db/admin";
import { requireSystemAdmin } from "@/lib/session";
import { OUTREACH_ARTEN, werteOutreachAus } from "@/lib/outreach-auswertung";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function datumAnzeige(tag: string) {
  const [j, m, t] = tag.split("-");
  return `${t}.${m}.${j}`;
}

export default async function SystemAnsprachePage() {
  await requireSystemAdmin();
  const kontakte = await adminDb.query.vereinKontakt.findMany({
    columns: { angeschriebenAm: true, anspracheGesendetAm: true, followupGesendetAm: true, outreachAbgemeldetAm: true },
  });
  const a = werteOutreachAus(kontakte);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Ansprache</h1>
        <p className="text-sm text-muted-foreground">
          Wie viele Vereine wurden wann angeschrieben (Instagram von Hand, automatische E-Mail, Follow-up)? Tage in deutscher Zeit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gesamt</CardTitle>
          <CardDescription>{a.vereineAngeschrieben} Vereine auf mindestens einem Weg angeschrieben.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {OUTREACH_ARTEN.map(({ art, label }) => (
            <div key={art} className="rounded-lg border p-3">
              <p className="text-2xl font-semibold">{a.gesamt[art]}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Je Tag</CardTitle>
          <CardDescription>Neueste zuerst.</CardDescription>
        </CardHeader>
        <CardContent>
          {a.tage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch kein Verein angeschrieben.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  {OUTREACH_ARTEN.map(({ art, label }) => (
                    <TableHead key={art} className="text-right">{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.tage.map((t) => (
                  <TableRow key={t.tag}>
                    <TableCell className="whitespace-nowrap">{datumAnzeige(t.tag)}</TableCell>
                    {OUTREACH_ARTEN.map(({ art }) => (
                      <TableCell key={art} className="text-right">{t.zahlen[art] || "–"}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
