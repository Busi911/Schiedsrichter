import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { VereinsterminFormular } from "@/components/vereinstermin-formular";
import { formatDatumZeitLang, formatZeit } from "@/lib/format";
import { ANTWORTEN, ARTEN, ROLLEN, SICHTBARKEITEN, fasseAntwortenZusammen, istAnstehend, istAntwort, type Art } from "@/lib/vereinstermine";
import { ladeAntworten, ladeVereinsPersonen, ladeVereinstermine, vereinstermineAktiv, zielgruppe, type VereinsterminListe } from "@/lib/vereinstermine-daten";
import { vereinsterminAendern, vereinsterminAnlegen, vereinsterminLoeschen } from "./actions";

// Vereinstermine (Sitzungen, Versammlungen, Arbeitseinsätze): anlegen, wer sie sieht, Antworten einsehen. Nur für Vereine, die sie unter
// Einstellungen → Vereinstermine eingeschaltet haben.
export default async function VereinsterminePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const schreiben = session.user.istAdmin;

  if (!(await vereinstermineAktiv(vereinId))) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">Vereinstermine</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Noch nicht eingeschaltet</CardTitle>
            <CardDescription>
              Mit Vereinsterminen legt ihr Sitzungen, Versammlungen oder Arbeitseinsätze an, bestimmt, wer sie sieht, und bekommt Zu- und Absagen. Schaltet sie unter
              Einstellungen → Vereinstermine ein.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/einstellungen#vereinstermine" className="inline-flex min-h-11 items-center font-medium underline">
              Zu den Einstellungen
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const jetzt = new Date();
  const [alle, personen] = await Promise.all([ladeVereinstermine(vereinId), ladeVereinsPersonen(vereinId)]);
  const antworten = await ladeAntworten(vereinId, alle.map((t) => t.id));
  const personenOptionen = personen.map((p) => ({ id: p.id, label: p.name ? `${p.name} (${p.email})` : p.email }));
  const name = new Map(personen.map((p) => [p.id, p.name ?? p.email]));
  const anstehend = alle.filter((t) => istAnstehend(t, jetzt));
  const vergangen = alle.filter((t) => !anstehend.includes(t)).reverse();

  const karte = (t: VereinsterminListe) => {
    const liste = antworten.get(t.id) ?? [];
    const ziel = zielgruppe(t, personen);
    const zahlen = fasseAntwortenZusammen(ziel.map((p) => p.id), liste);
    const wer = (t.sichtbarkeit === "auswahl"
      ? [...t.rollen.map((r) => ROLLEN[r as keyof typeof ROLLEN]?.label).filter(Boolean), ...t.personen.map((id) => name.get(id)).filter(Boolean)]
      : [SICHTBARKEITEN[t.sichtbarkeit as keyof typeof SICHTBARKEITEN] ?? t.sichtbarkeit]
    ).join(", ");
    return (
      <Card key={t.id} id={`termin-${t.id}`} className="scroll-mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{ARTEN[t.art as Art] ?? t.art}</Badge>
            <CardTitle className="text-base">{t.titel}</CardTitle>
          </div>
          <CardDescription>
            {formatDatumZeitLang(t.start)}
            {t.ende ? ` bis ${formatZeit(t.ende)} Uhr` : " Uhr"}
            {t.ort ? ` · ${t.ort}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {t.beschreibung && <p className="whitespace-pre-line text-muted-foreground">{t.beschreibung}</p>}
          <p>
            <span className="text-muted-foreground">Sichtbar für:</span> {wer} <span className="text-muted-foreground">({ziel.length} Personen)</span>
          </p>
          {t.antwortAbfrage ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 font-medium">
                {zahlen.zusage} Zusagen · {zahlen.vielleicht} Vielleicht · {zahlen.absage} Absagen · {zahlen.offen} offen
              </summary>
              <ul className="mt-1 flex flex-col gap-1">
                {liste.length === 0 && <li className="text-muted-foreground">Noch keine Antworten.</li>}
                {liste.map((a) => (
                  <li key={a.userId}>
                    <strong>{name.get(a.userId) ?? "Unbekannt"}</strong>: {istAntwort(a.antwort) ? ANTWORTEN[a.antwort] : a.antwort}
                    {a.kommentar ? <span className="text-muted-foreground"> · {a.kommentar}</span> : null}
                  </li>
                ))}
                {zahlen.offen > 0 && (
                  <li className="text-muted-foreground">
                    Noch offen: {ziel.filter((p) => !liste.some((a) => a.userId === p.id)).map((p) => p.name ?? p.email).join(", ")}
                  </li>
                )}
              </ul>
            </details>
          ) : (
            <p className="text-muted-foreground">Ohne Rückmeldung.</p>
          )}
          {schreiben && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <details>
                <summary className="min-h-11 cursor-pointer py-2 font-medium">Bearbeiten</summary>
                <div className="pt-2">
                  <VereinsterminFormular
                    action={vereinsterminAendern}
                    personen={personenOptionen}
                    werte={t}
                    absenden="Änderungen speichern"
                    informierenText="Bei Änderungen per Mail informieren (neu Eingeladene bekommen eine Einladung)"
                    idPraefix={`e-${t.id}`}
                  />
                </div>
              </details>
              <form action={vereinsterminLoeschen}>
                <input type="hidden" name="id" value={t.id} />
                <ConfirmSubmitButton variant="outline" size="sm" className="min-h-11 text-destructive" confirmText="Termin löschen? Wer zugesagt hat, bekommt eine Absage per Mail.">
                  Termin löschen
                </ConfirmSubmitButton>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold">Vereinstermine</h1>
          <HilfeHinweis anker="vereinstermine" />
        </div>
        <p className="text-sm text-muted-foreground">
          Sitzungen, Versammlungen und andere Termine des Vereins. Ihr bestimmt, wer sie sieht, und bekommt Zu- und Absagen. Die Eingeladenen finden die Termine unter
          „Vereinstermine“ im Profil.
        </p>
      </div>

      {schreiben && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Neuer Termin</CardTitle>
          </CardHeader>
          <CardContent>
            <VereinsterminFormular
              action={vereinsterminAnlegen}
              personen={personenOptionen}
              absenden="Termin anlegen"
              informierenText="Eingeladene per Mail informieren"
              idPraefix="neu"
            />
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Anstehend</h2>
        {anstehend.length === 0 ? <p className="text-sm text-muted-foreground">Keine anstehenden Vereinstermine.</p> : anstehend.map(karte)}
      </section>

      {vergangen.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-heading text-base font-medium">Vergangene Termine ({vergangen.length})</summary>
          <div className="flex flex-col gap-3 pt-2">{vergangen.map(karte)}</div>
        </details>
      )}
    </div>
  );
}
