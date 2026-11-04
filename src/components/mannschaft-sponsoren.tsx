import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatDatum } from "@/lib/format";
import type { SponsorZeile } from "@/lib/mannschaft-sponsor";
import type { VereinsMannschaft } from "@/lib/mitglied-mannschaften-daten";
import {
  mannschaftSponsorEntfernen,
  mannschaftSponsorSpeichern,
} from "@/app/admin/(dashboard)/mannschaften/sponsor-actions";

// Sponsoren der Mannschaften (Admin → Mannschaften). Der Verein pflegt sie selbst; unabhängig vom Vereinssponsor
// ("Präsentiert von …" beim Öffnen der Vereinsseite, den nur das HandballerPate-Team einrichtet).
export function MannschaftSponsoren({
  mannschaften,
  sponsoren,
  vereinsSlug,
  schreibend,
  aktuell,
  ok,
  fehler,
}: {
  mannschaften: VereinsMannschaft[];
  sponsoren: Map<string, SponsorZeile>;
  vereinsSlug: string | null;
  schreibend: boolean;
  aktuell?: string;
  ok?: string;
  fehler?: string;
}) {
  return (
    <Card id="sponsoren" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Sponsoren der Mannschaften</CardTitle>
        <CardDescription>
          Ein Sponsor je Mannschaft: sein Bild erscheint als kleine Zeile „Unterstützt von …“ auf der öffentlichen
          Mannschaftsseite. Das ist unabhängig vom Vereinssponsor (Einstellungen → Sponsor). Es erscheint nur, wenn der
          Sponsor eingeschaltet ist, ein Bild hat und der Zeitraum nicht abgelaufen ist.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!vereinsSlug || mannschaften.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dafür braucht der Verein eine öffentliche Vereinsseite mit Mannschaften (
            <Link href="/admin/einstellungen#oeffentliche-seite" className="underline">
              Einstellungen → Öffentliche Vereinsseite
            </Link>
            ).
          </p>
        ) : (
          mannschaften.map((m) => {
            const s = sponsoren.get(m.id);
            const offen = aktuell === m.id;
            return (
              <details key={m.id} id={`sponsor-${m.id}`} className="scroll-mt-20 rounded-lg border px-3 py-2" open={offen}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-medium">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{m.name}</span>
                  {s?.wirksam ? (
                    <Badge>{s.name ?? "Aktiv"}</Badge>
                  ) : s?.aktiv ? (
                    <Badge variant="outline">Abgelaufen / ohne Bild</Badge>
                  ) : s ? (
                    <Badge variant="secondary">Aus</Badge>
                  ) : (
                    <span className="text-xs font-normal text-muted-foreground">kein Sponsor</span>
                  )}
                </summary>
                {offen && ok && <p className="mt-3 rounded-md border border-green-600/40 bg-green-600/10 p-2 text-sm">{ok}</p>}
                {offen && fehler && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">{fehler}</p>}
                {schreibend ? (
                  <form action={mannschaftSponsorSpeichern} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="ligaMannschaftId" value={m.id} />
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={`ms-aktiv-${m.id}`} className="font-normal">
                        Sponsor anzeigen
                      </Label>
                      <Switch id={`ms-aktiv-${m.id}`} name="aktiv" defaultChecked={s?.aktiv ?? false} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`ms-name-${m.id}`}>Name des Sponsors</Label>
                      <Input id={`ms-name-${m.id}`} name="name" maxLength={80} defaultValue={s?.name ?? ""} placeholder="z.B. Muster GmbH" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`ms-link-${m.id}`}>Link (optional, https)</Label>
                      <Input id={`ms-link-${m.id}`} name="link" type="url" defaultValue={s?.link ?? ""} placeholder="https://www.beispiel.de" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`ms-bis-${m.id}`}>Gültig bis (leer = unbefristet)</Label>
                      <Input id={`ms-bis-${m.id}`} name="gueltigBis" type="date" defaultValue={s?.gueltigBis ?? ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`ms-bild-${m.id}`}>Bild (PNG, JPEG oder WebP, max. 5 MB)</Label>
                      <Input id={`ms-bild-${m.id}`} name="bild" type="file" accept="image/png,image/jpeg,image/webp" />
                      {s?.hatBild && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/admin/mannschaften/sponsor-bild/${m.id}`}
                          alt={s.name ? `Bild von ${s.name}` : "Sponsorenbild"}
                          className="mt-1 max-h-24 w-auto max-w-full self-start rounded border bg-muted/40 object-contain p-1"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SubmitButton pendingText="Speichert…">Speichern</SubmitButton>
                      {s?.gueltigBis && (
                        <span className="text-xs text-muted-foreground">
                          bis {formatDatum(new Date(`${s.gueltigBis}T12:00:00Z`))}
                        </span>
                      )}
                    </div>
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Dieser Zugang ist auf lesenden Zugriff beschränkt.</p>
                )}
                {s && schreibend && (
                  <form action={mannschaftSponsorEntfernen} className="mt-2 border-t pt-2">
                    <input type="hidden" name="ligaMannschaftId" value={m.id} />
                    <ConfirmSubmitButton size="sm" variant="ghost" pendingText="…" confirmText="Sponsor dieser Mannschaft samt Bild entfernen?">
                      Sponsor entfernen
                    </ConfirmSubmitButton>
                  </form>
                )}
              </details>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
