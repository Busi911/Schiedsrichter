import { betragNetto, zahlungsStand, type ZahlungsEingabe } from "@/lib/abrechnung";
import { KONTAKT_EMAIL } from "@/lib/beta-konditionen";
import { formatDatum } from "@/lib/format";

type Verein = ZahlungsEingabe & { sponsorUebernimmt: boolean; rechnungEmail: string | null };

// Hinweis für den Vereinsadmin im Admin-Bereich: Zahlungsperiode läuft bald ab bzw. Zahlung überfällig. Nichts bei befreiten Vereinen, in der
// Beta ohne fällige Rechnung, bei bezahlter Periode und wenn ein Sponsor alles übernimmt.
export function ZahlungsHinweis({ verein }: { verein: Verein }) {
  if (verein.sponsorUebernimmt) return null;
  const stand = zahlungsStand(verein, new Date());
  if ((stand.art !== "bald_faellig" && stand.art !== "ueberfaellig") || !stand.faelligAm || !stand.sperreAb) return null;
  const betrag = `${betragNetto(verein.tarif, false).toLocaleString("de-DE")} € netto`;
  const an = verein.rechnungEmail ? ` an ${verein.rechnungEmail}` : "";
  const text =
    stand.art === "ueberfaellig"
      ? `Die Zahlung (${betrag}) war am ${formatDatum(stand.faelligAm)} fällig. Bitte bis zum ${formatDatum(stand.sperreAb)} begleichen, sonst wird der Zugang gesperrt.`
      : verein.zahlungBis
        ? `Eure Zahlungsperiode endet am ${formatDatum(verein.zahlungBis)}. Die Rechnung (${betrag}) geht per E-Mail${an}.`
        : `Eure Rechnung (${betrag}) geht per E-Mail${an}, Zahlungsziel ${formatDatum(stand.faelligAm)}.`;
  return (
    <div className="border-b bg-amber-100 px-6 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <p className="mx-auto max-w-screen-2xl">
        <strong>Rechnung</strong> {text} Fragen: {KONTAKT_EMAIL}
      </p>
    </div>
  );
}
