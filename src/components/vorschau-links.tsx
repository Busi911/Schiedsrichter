import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { formatDatum } from "@/lib/format";
import { VORSCHAU_TAGE } from "@/lib/verein-vorschau-konstanten";
import { vorschauLinkErzeugen, vorschauLinkWiderrufen } from "@/app/system/vereine/actions";

type Link = { id: string; token: string; gueltigBis: Date };

// Geheime, befristete Vorschau-Links eines Vereins in Vorbereitung.
export function VorschauLinks({
  vereinId,
  slug,
  basisUrl,
  links,
}: {
  vereinId: string;
  slug: string | null;
  basisUrl: string;
  links: Link[];
}) {
  if (!slug) {
    return <p className="text-xs text-muted-foreground">Vorschau erst nach Hinterlegen der Vereins-ID.</p>;
  }
  return (
    <div className="mt-2 space-y-2 text-xs">
      <form action={vorschauLinkErzeugen} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="vereinId" value={vereinId} />
        <label className="text-muted-foreground" htmlFor={`tage-${vereinId}`}>
          Vorschau-Link, gültig
        </label>
        <select
          id={`tage-${vereinId}`}
          name="tage"
          defaultValue="3"
          className="h-8 rounded-md border bg-background px-2"
        >
          {VORSCHAU_TAGE.map((t) => (
            <option key={t} value={t}>
              {t} {t === 1 ? "Tag" : "Tage"}
            </option>
          ))}
        </select>
        <SubmitButton size="sm" variant="outline" pendingText="Erzeugt…">
          Link erzeugen
        </SubmitButton>
      </form>
      {links.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={`${basisUrl}/verein/${slug}/vorschau/${l.token}`}
            className="h-8 w-64 max-w-full rounded-md border bg-background px-2 font-mono"
          />
          <span className="text-muted-foreground">bis {formatDatum(l.gueltigBis)}</span>
          <form action={vorschauLinkWiderrufen}>
            <input type="hidden" name="linkId" value={l.id} />
            <ConfirmSubmitButton
              size="sm"
              variant="ghost"
              confirmText="Link widerrufen? Er funktioniert danach sofort nicht mehr."
              pendingText="…"
            >
              Widerrufen
            </ConfirmSubmitButton>
          </form>
        </div>
      ))}
    </div>
  );
}
