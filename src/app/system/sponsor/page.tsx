import { desc, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine, vereinSponsoren, vereine } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SPONSOR_DAUER_MAX, SPONSOR_DAUER_MIN, sponsorWirksam } from "@/lib/sponsor";
import { formatDatum } from "@/lib/format";
import { sponsorBildEntfernen, sponsorSpeichern } from "./actions";

export default async function SponsorPage({
  searchParams,
}: {
  searchParams: Promise<{ verein?: string; ok?: string; fehler?: string }>;
}) {
  await requireSystemAdmin();
  const { verein: aktuell, ok, fehler } = await searchParams;
  const alle = await adminDb.query.vereine.findMany({ orderBy: [desc(vereine.erstelltAm)] });
  const slugs = new Map((await adminDb.select({ id: ligaVereine.vereinId, slug: ligaVereine.slug }).from(ligaVereine)).map((z) => [z.id, z.slug]));
  // Ohne das Bild selbst zu laden (nur "ist vorhanden")
  const sponsoren = new Map(
    (
      await adminDb
        .select({
          vereinId: vereinSponsoren.vereinId,
          aktiv: vereinSponsoren.aktiv,
          name: vereinSponsoren.name,
          link: vereinSponsoren.link,
          dauer: vereinSponsoren.dauerSekunden,
          gueltigBis: vereinSponsoren.gueltigBis,
          aktualisiert: vereinSponsoren.aktualisiertAm,
          hatBild: sql<boolean>`${vereinSponsoren.png} is not null`,
        })
        .from(vereinSponsoren)
    ).map((s) => [s.vereinId, s])
  );
  const bildVorhanden = new Set([...sponsoren.values()].filter((x) => x.hatBild).map((x) => x.vereinId));
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Sponsor</h1>
        <p className="text-sm text-muted-foreground">
          Ein Sponsor übernimmt die technischen Kosten, dafür erscheint beim Öffnen der öffentlichen Seite des
          Vereins kurz sein Bild („Präsentiert von …“). Je Verein einstellbar, einmal pro Tag und Gerät.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {alle.map((v) => {
          const s = sponsoren.get(v.id);
          const hatBild = bildVorhanden.has(v.id);
          const wirksam = s ? sponsorWirksam({ aktiv: s.aktiv, hatBild, gueltigBis: s.gueltigBis }, heute) : false;
          const slug = slugs.get(v.id);
          return (
            <Card key={v.id} id={`v-${v.id}`} className="scroll-mt-20">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-heading text-base font-semibold [overflow-wrap:anywhere]">{v.name.replaceAll("/", "/​")}</h2>
                    <p className="text-xs text-muted-foreground">
                      {s?.name ? `${s.name} · ` : ""}
                      {s?.gueltigBis ? `gültig bis ${formatDatum(new Date(`${s.gueltigBis}T12:00:00Z`))}` : s ? "unbefristet" : "kein Sponsor eingerichtet"}
                    </p>
                  </div>
                  {wirksam ? <Badge className="shrink-0">Aktiv</Badge> : s?.aktiv ? <Badge variant="outline" className="shrink-0">Abgelaufen / ohne Bild</Badge> : <Badge variant="secondary" className="shrink-0">Aus</Badge>}
                </div>

                {aktuell === v.id && ok && <p className="rounded-md border border-green-600/40 bg-green-600/10 p-2 text-sm">{ok}</p>}
                {aktuell === v.id && fehler && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">{fehler}</p>}

                <details className="rounded-lg border px-3 py-2" open={aktuell === v.id}>
                  <summary className="cursor-pointer text-sm font-medium">Sponsor einstellen</summary>
                  <form action={sponsorSpeichern} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="vereinId" value={v.id} />
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={`aktiv-${v.id}`} className="font-normal">Sponsorenbild anzeigen</Label>
                      <Switch id={`aktiv-${v.id}`} name="aktiv" defaultChecked={s?.aktiv ?? false} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`name-${v.id}`}>Name des Sponsors</Label>
                      <Input id={`name-${v.id}`} name="name" maxLength={80} defaultValue={s?.name ?? ""} placeholder="z.B. Muster GmbH" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`link-${v.id}`}>Link (optional, https)</Label>
                      <Input id={`link-${v.id}`} name="link" type="url" defaultValue={s?.link ?? ""} placeholder="https://www.beispiel.de" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`dauer-${v.id}`}>Dauer (Sekunden)</Label>
                        <Input id={`dauer-${v.id}`} name="dauerSekunden" type="number" min={SPONSOR_DAUER_MIN} max={SPONSOR_DAUER_MAX} defaultValue={s?.dauer ?? 3} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`bis-${v.id}`}>Gültig bis (leer = unbefristet)</Label>
                        <Input id={`bis-${v.id}`} name="gueltigBis" type="date" defaultValue={s?.gueltigBis ?? ""} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`bild-${v.id}`}>Bild (PNG, JPEG oder WebP, max. 5 MB)</Label>
                      <Input id={`bild-${v.id}`} name="bild" type="file" accept="image/png,image/jpeg,image/webp" />
                      {hatBild && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/system/sponsor/bild/${v.id}?v=${s?.aktualisiert.getTime()}`} alt="" className="mt-1 max-h-32 w-auto self-start rounded border bg-muted/40 object-contain p-1" />
                      )}
                    </div>
                    <SubmitButton pendingText="Speichert…">Speichern</SubmitButton>
                  </form>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                    {slug ? (
                      <a href={`/verein/${slug}?sponsor=zeigen`} target="_blank" rel="noreferrer" className="underline">
                        Auf der öffentlichen Seite ansehen
                      </a>
                    ) : (
                      <span>Öffentliche Seite noch nicht eingerichtet.</span>
                    )}
                    {hatBild && (
                      <form action={sponsorBildEntfernen}>
                        <input type="hidden" name="vereinId" value={v.id} />
                        <ConfirmSubmitButton size="sm" variant="ghost" pendingText="…" confirmText="Bild entfernen und den Sponsor ausschalten?">
                          Bild entfernen
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
