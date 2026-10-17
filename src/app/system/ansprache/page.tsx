import { adminDb } from "@/db/admin";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OUTREACH_PRO_LAUF_MAX, OUTREACH_PRO_LAUF_MIN } from "@/lib/outreach-einstellungen";
import { holeSystemEinstellungen } from "@/lib/system-einstellungen";
import { outreachEinstellungenSpeichern } from "./actions";
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
  const einstellungen = await holeSystemEinstellungen();

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
          <CardTitle>Automatische Ansprache</CardTitle>
          <CardDescription>
            Der Cron läuft zweimal täglich (10:30 und 16:30 UTC, also ca. 12:30 und 18:30 Uhr im Sommer), legt neue Vereine aus dem nuLiga-Index an und schreibt sie per
            E-Mail an. Hier steuerst du, ob und wie viele. Wirkt beim nächsten Lauf.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={outreachEinstellungenSpeichern} className="flex flex-col gap-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="outreachAktiv" defaultChecked={einstellungen.outreachAktiv} className="mt-1 size-4" />
              <span>
                Neue Vereine automatisch anschreiben
                <span className="block text-xs text-muted-foreground">
                  Aus = der Cron legt keine Vereine an und verschickt keine Erstmail.
                </span>
              </span>
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="outreachProLauf">Vereine pro Lauf</Label>
              <Input
                id="outreachProLauf"
                name="outreachProLauf"
                type="number"
                inputMode="numeric"
                min={OUTREACH_PRO_LAUF_MIN}
                max={OUTREACH_PRO_LAUF_MAX}
                defaultValue={einstellungen.outreachProLauf}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">
                Ziel erfolgreich angeschriebener Vereine je Lauf ({OUTREACH_PRO_LAUF_MIN}–{OUTREACH_PRO_LAUF_MAX}, Standard 5; zwei
                Läufe am Tag).
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="outreachNachfassAktiv"
                defaultChecked={einstellungen.outreachNachfassAktiv}
                className="mt-1 size-4"
              />
              <span>
                Nachfassen (Erinnerungsmail nach 7 Tagen, Nachfass an Instagram-Vereine)
                <span className="block text-xs text-muted-foreground">
                  Aus = diese Mails gehen nicht raus. Das automatische Inaktiv-Setzen läuft weiter (es verschickt nichts).
                </span>
              </span>
            </label>
            <SubmitButton pendingText="Speichert …" className="self-start">
              Speichern
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

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
