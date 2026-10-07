import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { betragNetto, KARENZ_TAGE, TARIF_NAMEN, vorschlagBezahltBis, zahlungsStand, ZAHLUNGS_RANG, ZAHLUNGS_TEXT, type ZahlungsArt } from "@/lib/abrechnung";
import { NETTO } from "@/lib/beta-konditionen";
import { formatDatum } from "@/lib/format";
import { tagKey } from "@/lib/kalender";
import { requireSystemAdmin } from "@/lib/session";
import { alsBezahltMarkieren, sperreUmschalten, tarifSpeichern, zahlungszielSetzen } from "./actions";

export const dynamic = "force-dynamic";

const FARBE: Record<ZahlungsArt, string> = {
  gesperrt: "bg-red-700 text-white",
  ueberfaellig: "bg-red-700 text-white",
  bald_faellig: "bg-amber-600 text-white",
  beta_kostenlos: "bg-muted text-foreground",
  bezahlt: "bg-emerald-700 text-white",
  befreit: "bg-muted text-foreground",
  vorbereitung: "bg-muted text-foreground",
};

// Rechnungen stelle ich von Hand: hier steht je Verein alles, was dafür nötig ist (Betrag, Anschrift, E-Mail), und nach Zahlungseingang genügt
// ein Klick auf "Als bezahlt markieren". Dringendes steht oben.
export default async function AbrechnungSeite({ searchParams }: { searchParams: Promise<{ ok?: string; fehler?: string }> }) {
  await requireSystemAdmin();
  const { ok, fehler } = await searchParams;
  const jetzt = new Date();
  const alle = await adminDb.select().from(vereine).where(eq(vereine.status, "aktiv"));
  const zeilen = alle
    .map((v) => ({ v, stand: zahlungsStand(v, jetzt) }))
    .sort((a, b) => ZAHLUNGS_RANG[a.stand.art] - ZAHLUNGS_RANG[b.stand.art] || (a.stand.faelligAm?.getTime() ?? Infinity) - (b.stand.faelligAm?.getTime() ?? Infinity) || a.v.name.localeCompare(b.v.name));
  const zaehle = (...arten: ZahlungsArt[]) => zeilen.filter((z) => arten.includes(z.stand.art)).length;
  const summe = zeilen.reduce((s, z) => s + (z.stand.art === "befreit" ? 0 : betragNetto(z.v.tarif, z.v.sponsorUebernimmt)), 0);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Abrechnung</h1>
        <p className="text-sm text-muted-foreground">
          Rechnung von Hand stellen, nach Zahlungseingang „Als bezahlt markieren“ (12 Monate). {NETTO} Gesperrt wird {KARENZ_TAGE} Tage nach Fälligkeit; die Sperre
          ist je Verein aussetzbar. Du bekommst eine Mail, wenn eine Periode bald abläuft, überfällig ist oder gesperrt wird.
        </p>
      </div>

      {ok && <p className="rounded-md border bg-muted p-3 text-sm break-words">{ok}</p>}
      {fehler && <p className="rounded-md border border-destructive p-3 text-sm break-words text-destructive">{fehler}</p>}

      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          ["Gesperrt/überfällig", zaehle("gesperrt", "ueberfaellig")],
          ["Bald fällig", zaehle("bald_faellig")],
          ["Bezahlt", zaehle("bezahlt")],
          [`Jahresvolumen netto`, `${summe.toLocaleString("de-DE")} €`],
        ].map(([label, wert]) => (
          <Card key={String(label)} size="sm" className="gap-0 px-2 py-3">
            <p className="font-heading text-xl font-bold tabular-nums">{wert}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>

      {zeilen.map(({ v, stand }) => {
        const adresse = [v.strasse, [v.plz, v.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        const vorschlag = tagKey(vorschlagBezahltBis(v, jetzt));
        const betrag = betragNetto(v.tarif, v.sponsorUebernimmt);
        return (
          <Card key={v.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-base leading-snug font-semibold [overflow-wrap:anywhere]">{v.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {TARIF_NAMEN[v.tarif]}
                    {v.sponsorUebernimmt ? " · Sponsor übernimmt alles" : ""} · {betrag.toLocaleString("de-DE")} € netto im Jahr
                  </p>
                </div>
                <Badge className={`shrink-0 ${FARBE[stand.art]}`}>{ZAHLUNGS_TEXT[stand.art]}</Badge>
              </div>

              <p className="text-sm">
                {v.zahlungBis ? <>Bezahlt bis <strong>{formatDatum(v.zahlungBis)}</strong>. </> : null}
                {stand.faelligAm && stand.art !== "bezahlt" ? (
                  <>
                    Fällig {stand.tageBisFaellig !== null && stand.tageBisFaellig >= 0 ? `am ${formatDatum(stand.faelligAm)} (in ${stand.tageBisFaellig} Tagen)` : `war am ${formatDatum(stand.faelligAm)}`}
                    {stand.sperreAb ? `; Sperre ab ${formatDatum(stand.sperreAb)}${v.zahlungSperreAus ? " (ausgesetzt)" : ""}` : ""}.
                  </>
                ) : null}
              </p>

              <div className="rounded-lg bg-muted/50 p-2.5 text-sm [overflow-wrap:anywhere]">
                <p className="text-xs font-medium text-muted-foreground">Rechnungsdaten</p>
                <p>{v.name}</p>
                <p>{adresse || <span className="text-muted-foreground">(keine Anschrift hinterlegt)</span>}</p>
                <p>
                  {v.rechnungAnsprechpartner ? `${v.rechnungAnsprechpartner} · ` : ""}
                  {v.rechnungEmail ? (
                    <a href={`mailto:${v.rechnungEmail}`} className="underline underline-offset-2">
                      {v.rechnungEmail}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">(keine Rechnungs-E-Mail hinterlegt)</span>
                  )}
                </p>
                {v.sponsorUebernimmt && <p className="mt-1 text-xs text-muted-foreground">Rechnungsempfänger ist der Sponsor — Anschrift des Sponsors von Hand ergänzen.</p>}
              </div>

              <div className="flex flex-col gap-2 border-t pt-3">
                <form action={alsBezahltMarkieren} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="vereinId" value={v.id} />
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`bis-${v.id}`} className="text-xs">
                      Bezahlt bis
                    </Label>
                    <Input id={`bis-${v.id}`} name="bis" type="date" defaultValue={vorschlag} required className="h-8 w-40" />
                  </div>
                  <ConfirmSubmitButton size="sm" confirmText={`„${v.name}“ als bezahlt markieren? Der Zugang ist damit sofort frei.`} pendingText="Speichert…">
                    Als bezahlt markieren
                  </ConfirmSubmitButton>
                </form>

                {!v.zahlungBis && v.tarif !== "befreit" && (
                  <form action={zahlungszielSetzen} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="vereinId" value={v.id} />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`ziel-${v.id}`} className="text-xs">
                        Erstes Zahlungsziel (Beta verlängern; leer = Standard)
                      </Label>
                      <Input id={`ziel-${v.id}`} name="ziel" type="date" defaultValue={v.zahlungFaelligAm ? tagKey(v.zahlungFaelligAm) : ""} className="h-8 w-40" />
                    </div>
                    <SubmitButton size="sm" variant="outline" pendingText="Speichert…">
                      Ziel speichern
                    </SubmitButton>
                  </form>
                )}

                <form action={tarifSpeichern} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="vereinId" value={v.id} />
                  <select name="tarif" defaultValue={v.tarif} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" aria-label="Tarif">
                    {(Object.keys(TARIF_NAMEN) as (keyof typeof TARIF_NAMEN)[]).map((t) => (
                      <option key={t} value={t}>
                        {TARIF_NAMEN[t]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="sponsor" defaultChecked={v.sponsorUebernimmt} /> Sponsor übernimmt alles
                  </label>
                  <SubmitButton size="sm" variant="outline" pendingText="Speichert…">
                    Speichern
                  </SubmitButton>
                </form>

                {(stand.art === "ueberfaellig" || stand.art === "gesperrt" || v.zahlungSperreAus) && (
                  <form action={sperreUmschalten}>
                    <input type="hidden" name="vereinId" value={v.id} />
                    <SubmitButton size="sm" variant="outline" pendingText="Speichert…">
                      {v.zahlungSperreAus ? "Sperre wieder scharf stellen" : "Sperre aussetzen"}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {zeilen.length === 0 && <p className="text-sm text-muted-foreground">Noch keine aktiven Vereine.</p>}
    </div>
  );
}
