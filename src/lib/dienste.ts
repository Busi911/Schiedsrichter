import "server-only";
import type { mannschaften, vereine } from "@/db/schema";

type VereinBedarf = Pick<
  typeof vereine.$inferSelect,
  | "testspielOrdnerBedarf"
  | "testspielKioskdienstBedarf"
  | "turnierOrdnerBedarf"
  | "turnierKioskdienstBedarf"
  | "rundenspielOrdnerBedarf"
  | "rundenspielKioskdienstBedarf"
  | "testspielKassiererBedarf"
  | "turnierKassiererBedarf"
  | "rundenspielKassiererBedarf"
  | "testspielZeitnehmerBedarf"
  | "turnierZeitnehmerBedarf"
  | "rundenspielZeitnehmerBedarf"
>;

type Rolle = "ordner" | "kioskdienst" | "kassierer" | "zeitnehmer";

// Dienste-Bedarf (Ordner/Kioskdienst/Kassierer/Zeitnehmer-Sekretär) gilt
// bewusst nur für testspiel/turnier/rundenspiel (eigene Veranstaltungen bzw.
// Heimspiele an der eigenen Halle) — nicht für spiel_ics (persönliche
// Einsätze des Schiedsrichters, oft bei fremden Vereinen, ohne jeden Bezug
// zur eigenen Halle). Der Zeitnehmerwart kann diesen 0-Bedarf für einen
// einzelnen spiel_ics-Termin trotzdem überschreiben (siehe
// zeitnehmerBedarfOverride unten), falls der Verein ausnahmsweise doch
// jemanden mitschickt.
//
// Bei Rundenspielen mit pflichtspiel = false (Freundschaftsspiel/Turnier
// innerhalb des Liga-Spielplans, siehe rundenspiel-import.ts) ist der
// rundenspielOrdnerBedarf/-KioskdienstBedarf/-ZeitnehmerBedarf NICHT
// zutreffend — das ist der Bedarf für echte Ligaspiele. Stattdessen gilt der
// Bedarf der Veranstaltung, die es laut freundschaftsTyp tatsächlich ist
// (testspiel- bzw. turnier-Bedarf), bzw. testspielBedarf als Fallback, wenn
// freundschaftsTyp (noch) nicht eindeutig ableitbar war.
export function bedarfFuer(
  verein: VereinBedarf,
  typ: string,
  rolle: Rolle,
  pflichtspiel?: boolean | null,
  freundschaftsTyp?: "freundschaftsspiel" | "turnier" | null,
  // Vom Zeitnehmerwart pro Einzeltermin gesetzter Override (siehe
  // termine.zeitnehmerBedarfOverride in db/schema.ts) — nur für rolle
  // "zeitnehmer" relevant, geht bei gesetztem Wert (auch 0) allen anderen
  // Regeln unten vor, inklusive dem spiel_ics-Standardwert.
  zeitnehmerBedarfOverride?: number | null,
  // Vom jeweiligen Wart pro Mannschaft gesetzt (siehe
  // mannschaften.ordnerBedarfDeaktiviert/kioskdienstBedarfDeaktiviert/
  // zeitnehmerBedarfDeaktiviert in db/schema.ts) — true bedeutet, dass diese
  // Mannschaft für die übergebene Rolle grundsätzlich keinen Bedarf hat.
  // Geht dem globalen Bedarf vor, aber NICHT dem expliziten
  // zeitnehmerBedarfOverride oben: ein bewusst für genau diesen Termin
  // gesetzter Override ist die spezifischere Entscheidung.
  mannschaftBedarfDeaktiviert?: boolean | null
): number {
  if (rolle === "zeitnehmer" && zeitnehmerBedarfOverride != null) {
    return zeitnehmerBedarfOverride;
  }
  if (mannschaftBedarfDeaktiviert) {
    return 0;
  }
  // spiel_ics = persönlicher ICS-Feed-Einsatz eines Schiedsrichters (oft bei
  // fremden Vereinen, ohne jeden Bezug zur eigenen Halle) — wie beim Ordner-/
  // Kioskdienst-Bedarf oben braucht das grundsätzlich keinen Zeitnehmer/
  // Sekretär vom eigenen Verein. Der Zeitnehmerwart kann für ein einzelnes
  // spiel_ics trotzdem einen Bedarf setzen (siehe zeitnehmerBedarfOverride
  // oben, das dieser Regel vorgeht), falls der Verein ausnahmsweise doch
  // jemanden mitschickt.
  if (rolle === "zeitnehmer" && typ === "spiel_ics") {
    return 0;
  }
  // Zeitnehmer/Sekretär wird PRO Einzelspiel besetzt, auch beim Turnier
  // (anders als Ordner/Kioskdienst, die für den ganzen Turnier-Container
  // gelten, siehe Kommentar in admin/kalender/page.tsx) — turnier_spiel
  // zählt für den Zeitnehmer-Bedarf daher wie der Turnier-Container selbst.
  const typFuerBedarf = rolle === "zeitnehmer" && typ === "turnier_spiel" ? "turnier" : typ;
  const feld = (
    typFuerBedarf === "testspiel" ||
    (typFuerBedarf === "rundenspiel" && pflichtspiel === false && freundschaftsTyp !== "turnier")
  )
    ? "testspiel"
    : typFuerBedarf === "turnier" ||
        (typFuerBedarf === "rundenspiel" && pflichtspiel === false && freundschaftsTyp === "turnier")
      ? "turnier"
      : typFuerBedarf === "rundenspiel"
        ? "rundenspiel"
        : null;
  if (!feld) return 0;
  if (rolle === "ordner") return verein[`${feld}OrdnerBedarf`];
  if (rolle === "kioskdienst") return verein[`${feld}KioskdienstBedarf`];
  if (rolle === "kassierer") return verein[`${feld}KassiererBedarf`];
  return verein[`${feld}ZeitnehmerBedarf`];
}

type MannschaftBedarfDeaktiviert = Pick<
  typeof mannschaften.$inferSelect,
  | "ordnerBedarfDeaktiviert"
  | "kioskdienstBedarfDeaktiviert"
  | "kassiererBedarfDeaktiviert"
  | "zeitnehmerBedarfDeaktiviert"
>;

// Wählt aus den vier Mannschafts-Flags das für die übergebene Rolle passende
// aus — für den mannschaftBedarfDeaktiviert-Parameter von bedarfFuer oben.
// mannschaft = undefined (Termin ohne Mannschaftsbezug, z.B. Turnier ohne
// erkannte Mannschaft) bedeutet: keine Deaktivierung.
export function mannschaftBedarfDeaktiviertFuer(
  mannschaft: MannschaftBedarfDeaktiviert | null | undefined,
  rolle: Rolle
): boolean {
  if (!mannschaft) return false;
  if (rolle === "ordner") return mannschaft.ordnerBedarfDeaktiviert;
  if (rolle === "kioskdienst") return mannschaft.kioskdienstBedarfDeaktiviert;
  if (rolle === "kassierer") return mannschaft.kassiererBedarfDeaktiviert;
  return mannschaft.zeitnehmerBedarfDeaktiviert;
}
