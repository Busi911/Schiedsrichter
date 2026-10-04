import type { SpielAnsicht } from "./liga-spiele-hilfen";

// Anzeige-Phase eines Spiels aus den TATSÄCHLICH gespeicherten nuLiga-Daten (rein, ohne DB).
//
// Bewusst KEIN "live": Ob ein Spiel gerade läuft, steht in den gespeicherten Daten nicht (der Spielplan
// kennt nur Ergebnis, "Spielbericht genehmigt", Verlegung, Absage). Zeit allein macht ein Spiel nie zu
// "live". Sobald eine geprüfte Live-Quelle bekannt ist (siehe README, Live-Ticker), kommt "live" als
// weitere Phase VOR "laeuft_evtl" dazu.
//
// Priorität: gewertet/abgesagt/verlegt → genehmigtes Ergebnis → vorläufiges Ergebnis → Spielbericht
// angelegt (nuLiga zeigt den Link erst dann) → geplant.
export type SpielPhase =
  | "geplant"
  | "verlegt"
  | "abgesagt"
  | "nicht_angetreten"
  | "bericht_angelegt" // Spielbericht-Link da, aber noch kein Ergebnis (Anwurf bevorsteht oder läuft)
  | "ergebnis_vorlaeufig"
  | "beendet";

const KURZ = (s: SpielAnsicht) => s.toreHeim !== null && s.toreGast !== null;

export function spielPhase(s: SpielAnsicht): SpielPhase {
  if (s.status === "abgesagt") return "abgesagt";
  if (s.status === "nicht_angetreten") return "nicht_angetreten";
  if (KURZ(s)) return s.ergebnisBestaetigt ? "beendet" : "ergebnis_vorlaeufig";
  if (s.status === "verlegt") return "verlegt";
  if (s.meetingId || s.berichtUrl) return "bericht_angelegt";
  return "geplant";
}
