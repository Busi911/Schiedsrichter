import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { formatDatumZeitLang, formatZeit } from "@/lib/format";
import { istWiederholung, kuerzeSerien, serienText } from "@/lib/wiederholung";
import { ANTWORTEN, ARTEN, antwortNochMoeglich, fasseAntwortenZusammen, istAnstehend, istAntwort, type Art } from "@/lib/vereinstermine";
import { holeSichtbareVereinstermine, holeVereinsterminPerson, ladeAntworten, ladeVereinsPersonen, vereinstermineAktiv, zielgruppe } from "@/lib/vereinstermine-daten";
import { vereinsterminAntwortenSetzen, vereinsterminAntwortZuruecknehmen } from "./actions";

// Vereinstermine (Sitzungen u.ä.) für alle Personen, die sie sehen dürfen — mit Zu-/Absage. Gibt es die Funktion im Verein nicht, existiert die Seite nicht.
export default async function VereinsterminePage() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;
  if (!(await vereinstermineAktiv(vereinId))) notFound();

  const jetzt = new Date();
  const istAdmin = session.user.istAdmin || !!session.user.istAdminLesend;
  const person = await holeVereinsterminPerson(vereinId, userId, istAdmin);
  const alleAnstehend = (await holeSichtbareVereinstermine(vereinId, person, new Date(jetzt.getTime() - 24 * 3600_000))).filter((t) => istAnstehend(t, jetzt));
  // Von einer Serie (z.B. monatliche Sitzung) die nächsten drei Termine; die weiteren erscheinen, sobald sie näher rücken.
  const { sichtbar: termine, ausgeblendet } = kuerzeSerien(alleAnstehend, 3);
  const [antworten, personen] = await Promise.all([ladeAntworten(vereinId, termine.map((t) => t.id)), ladeVereinsPersonen(vereinId)]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pb-24 md:pb-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="font-heading text-2xl font-semibold">Vereinstermine</h1>
          <HilfeHinweis anker="vereinstermine" />
        </div>
        <p className="text-sm text-muted-foreground">Sitzungen, Versammlungen und andere Termine des Vereins, zu denen du eingeladen bist.</p>
        {session.user.istAdmin && (
          <Link href="/admin/vereinstermine" className="inline-flex min-h-11 items-center text-sm font-medium underline">
            Termine verwalten
          </Link>
        )}
      </div>

      {termine.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keine anstehenden Termine</CardTitle>
            <CardDescription>Sobald der Verein einen Termin für dich einträgt, steht er hier.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        termine.map((t) => {
          const liste = antworten.get(t.id) ?? [];
          const meine = liste.find((a) => a.userId === userId);
          const zahlen = fasseAntwortenZusammen(zielgruppe(t, personen).map((p) => p.id), liste);
          const kannAntworten = t.antwortAbfrage && antwortNochMoeglich(t.start, jetzt);
          return (
            <Card key={t.id} id={`termin-${t.id}`} className="scroll-mt-6">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{ARTEN[t.art as Art] ?? t.art}</Badge>
                  <CardTitle className="text-base">{t.titel}</CardTitle>
                  {t.serieId && t.wiederholung && istWiederholung(t.wiederholung) && <Badge variant="outline">{serienText(t.wiederholung, t.start)}</Badge>}
                </div>
                <CardDescription>
                  {formatDatumZeitLang(t.start)}
                  {t.ende ? ` bis ${formatZeit(t.ende)} Uhr` : " Uhr"}
                  {t.ort ? ` · ${t.ort}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {t.beschreibung && <p className="whitespace-pre-line text-muted-foreground">{t.beschreibung}</p>}
                {t.antwortAbfrage && (
                  <>
                    <p>
                      Deine Antwort:{" "}
                      {meine && istAntwort(meine.antwort) ? (
                        <Badge>{ANTWORTEN[meine.antwort]}</Badge>
                      ) : (
                        <Badge variant="warning">noch offen</Badge>
                      )}
                      {meine?.kommentar ? <span className="text-muted-foreground"> · {meine.kommentar}</span> : null}
                    </p>
                    {kannAntworten && (
                      <form action={vereinsterminAntwortenSetzen} className="flex flex-col gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <Input name="kommentar" maxLength={200} defaultValue={meine?.kommentar ?? ""} placeholder="Notiz (optional), z.B. „komme etwas später“" aria-label="Notiz (optional)" />
                        <div className="grid grid-cols-3 gap-2">
                          <SubmitButton name="antwort" value="zusage" variant={meine?.antwort === "zusage" ? "default" : "outline"} className="min-h-11" pendingText="…">
                            Zusagen
                          </SubmitButton>
                          <SubmitButton name="antwort" value="vielleicht" variant={meine?.antwort === "vielleicht" ? "default" : "outline"} className="min-h-11" pendingText="…">
                            Vielleicht
                          </SubmitButton>
                          <SubmitButton name="antwort" value="absage" variant={meine?.antwort === "absage" ? "default" : "outline"} className="min-h-11" pendingText="…">
                            Absagen
                          </SubmitButton>
                        </div>
                      </form>
                    )}
                    {kannAntworten && meine && (
                      <form action={vereinsterminAntwortZuruecknehmen}>
                        <input type="hidden" name="id" value={t.id} />
                        <SubmitButton variant="ghost" size="sm" className="min-h-11" pendingText="…">
                          Antwort zurücknehmen
                        </SubmitButton>
                      </form>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Bisher: {zahlen.zusage} Zusagen · {zahlen.vielleicht} Vielleicht · {zahlen.absage} Absagen. Wer geantwortet hat, sehen nur die Vereinsadmins.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
      {ausgeblendet.size > 0 && (
        <p className="text-xs text-muted-foreground">
          Von wiederkehrenden Terminen siehst du jeweils die nächsten drei; die weiteren erscheinen, sobald sie näher rücken.
        </p>
      )}
    </div>
  );
}
