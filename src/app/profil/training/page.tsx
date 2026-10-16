import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, gte } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, hallen, mannschaften, trainingAusfaelle, trainingszeiten, vereine } from "@/db/schema";
import {
  berlinJetzt,
  darfAusfallMelden,
  darfTrainingSehen,
  formatMinuten,
  formatTrainingDatum,
  konkreteTrainings,
  type KonkretesTraining,
} from "@/lib/training-ausfall";
import { abteilLabel, istInSaison, ortWort } from "@/lib/trainingsplan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { trainingAusfallMelden, trainingAusfallZuruecknehmen } from "./actions";

const TAGE = 14;

// Extra-Punkt "Training": die Trainings der nächsten zwei Wochen aus dem Trainingsplan mit gemeldeten Ausfällen ("Halle frei"). Admins und Trainer sehen
// ihn immer, alle anderen nur, wenn der Verein ihn unter Einstellungen → Training freigeschaltet hat. Ausfälle melden dürfen Admins und Trainer der Mannschaft.
export default async function TrainingPage() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;
  const heute = berlinJetzt(new Date()).datum;

  const daten = await withTenant(vereinId, async (tx) => {
    const [verein, zeiten, ausfaelle, mannschaftenListe, hallenListe, rollen] = await Promise.all([
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { trainingFuerAlleSichtbar: true } }),
      tx.query.trainingszeiten.findMany({ where: eq(trainingszeiten.vereinId, vereinId) }),
      tx.query.trainingAusfaelle.findMany({ where: and(eq(trainingAusfaelle.vereinId, vereinId), gte(trainingAusfaelle.datum, heute)) }),
      tx.query.mannschaften.findMany({ where: eq(mannschaften.vereinId, vereinId) }),
      tx.query.hallen.findMany({ where: eq(hallen.vereinId, vereinId) }),
      tx.query.funktionstraegerRollen.findMany({
        where: and(eq(funktionstraegerRollen.userId, userId), eq(funktionstraegerRollen.typ, "trainer"), eq(funktionstraegerRollen.aktiv, true)),
        columns: { mannschaftId: true },
      }),
    ]);
    return { verein, zeiten, ausfaelle, mannschaftenListe, hallenListe, rollen };
  });

  const istTrainer = daten.rollen.length > 0;
  if (
    !darfTrainingSehen({
      istAdmin: session.user.istAdmin,
      istAdminLesend: !!session.user.istAdminLesend,
      istTrainer,
      fuerAlleSichtbar: daten.verein?.trainingFuerAlleSichtbar ?? false,
    })
  ) {
    notFound();
  }

  const trainerMannschaftIds = daten.rollen.flatMap((r) => (r.mannschaftId ? [r.mannschaftId] : []));
  const mannschaftName = new Map(
    daten.mannschaftenListe.map((m) => [m.id, m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name])
  );
  const halleNachId = new Map(daten.hallenListe.map((h) => [h.id, h]));
  const hallenName = (t: KonkretesTraining) => {
    const h = halleNachId.get(t.halleId);
    if (!h) return "Halle";
    return t.abteilNummer ? `${h.name}, ${abteilLabel(h, t.abteilNummer)}` : h.name;
  };

  // Orte mit Saison (z.B. Beachplatz Mai bis September): außerhalb der Saison gibt es dort keine Trainings.
  const inSaison = (halleId: string, datum: string) => {
    const h = halleNachId.get(halleId);
    return !h || istInSaison(h, datum);
  };
  const trainings = konkreteTrainings(daten.zeiten, daten.ausfaelle, new Date(), TAGE, inSaison);
  const hatPlatz = daten.hallenListe.some((h) => h.art === "platz");
  const frei_ = (t: KonkretesTraining) => `${ortWort(halleNachId.get(t.halleId)?.art)} frei`;
  const frei = trainings.filter((t) => t.ausgefallen);
  const nachTag = new Map<string, KonkretesTraining[]>();
  for (const t of trainings) nachTag.set(t.datum, [...(nachTag.get(t.datum) ?? []), t]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pb-24 md:pb-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="font-heading text-2xl font-semibold">Training</h1>
          <HilfeHinweis anker="training" />
        </div>
        <p className="text-sm text-muted-foreground">
          Die Trainings der nächsten {TAGE} Tage aus dem Trainingsplan. Fällt ein Training aus, ist der Ort in dieser Zeit frei.
        </p>
        {session.user.istAdmin && (
          <Link href="/admin/trainingsplan" className="inline-flex min-h-11 items-center text-sm font-medium underline">
            Trainingsplan bearbeiten
          </Link>
        )}
      </div>

      <Card id="frei" className="scroll-mt-6 border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">{hatPlatz ? "Freie Hallen- und Platzzeiten" : "Freie Hallenzeiten"}</CardTitle>
          <CardDescription>Hier fällt ein Training aus, {hatPlatz ? "Halle oder Platz sind" : "die Halle ist"} in dieser Zeit nicht belegt.</CardDescription>
        </CardHeader>
        <CardContent>
          {frei.length === 0 ? (
            <p className="text-sm text-muted-foreground">Im Moment sind keine Trainings abgesagt.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {frei.map((t) => (
                <li key={`${t.id}-${t.datum}`}>
                  <strong>{formatTrainingDatum(t.datum, false)}, {formatMinuten(t.startMinuten)}–{formatMinuten(t.endMinuten)} Uhr</strong> ·{" "}
                  {hallenName(t)} <span className="text-muted-foreground">(fällt aus: {mannschaftName.get(t.mannschaftId) ?? "Mannschaft"}{t.grund ? `, ${t.grund}` : ""})</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {trainings.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Noch keine Trainings</CardTitle>
            <CardDescription>
              Im Trainingsplan des Vereins sind noch keine wöchentlichen Trainingszeiten eingetragen.
              {session.user.istAdmin ? " Das erledigt ihr unter „Trainingsplan bearbeiten“." : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        [...nachTag.entries()].map(([datum, liste]) => (
          <section key={datum} className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium">
              {formatTrainingDatum(datum)}
              {datum === berlinJetzt(new Date()).datum ? " (heute)" : ""}
            </h2>
            {liste.map((t) => {
              const darfMelden = darfAusfallMelden({ istAdmin: session.user.istAdmin, trainerMannschaftIds, mannschaftId: t.mannschaftId });
              const eigene = trainerMannschaftIds.includes(t.mannschaftId);
              return (
                <Card key={`${t.id}-${t.datum}`} size="sm" className={t.ausgefallen ? "border-primary/40" : undefined}>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium tabular-nums">
                        {formatMinuten(t.startMinuten)}–{formatMinuten(t.endMinuten)}
                      </span>
                      <span>{mannschaftName.get(t.mannschaftId) ?? "Mannschaft"}</span>
                      {eigene && <Badge variant="secondary">Deine Mannschaft</Badge>}
                      {t.ausgefallen && <Badge>Fällt aus · {frei_(t)}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {hallenName(t)}
                      {t.grund ? ` · ${t.grund}` : ""}
                    </p>
                    {darfMelden &&
                      (t.ausgefallen ? (
                        <form action={trainingAusfallZuruecknehmen}>
                          <input type="hidden" name="trainingszeitId" value={t.id} />
                          <input type="hidden" name="datum" value={t.datum} />
                          <ConfirmSubmitButton
                            variant="outline"
                            size="sm"
                            className="min-h-11 w-full sm:w-auto"
                            confirmText="Training findet doch statt? Alle Trainer bekommen eine kurze Info."
                          >
                            Findet doch statt
                          </ConfirmSubmitButton>
                        </form>
                      ) : (
                        <form action={trainingAusfallMelden} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="trainingszeitId" value={t.id} />
                          <input type="hidden" name="datum" value={t.datum} />
                          <Input name="grund" maxLength={200} placeholder="Grund (optional)" aria-label="Grund (optional)" className="w-full sm:w-64" />
                          <ConfirmSubmitButton
                            variant="outline"
                            size="sm"
                            className="min-h-11 w-full sm:w-auto"
                            confirmText="Training fällt aus? Alle Trainer des Vereins bekommen eine Info-Mail, dass die Halle frei ist."
                          >
                            Fällt aus
                          </ConfirmSubmitButton>
                        </form>
                      ))}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
