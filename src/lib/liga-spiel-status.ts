import type { SpielAnsicht } from "./liga-spiele-hilfen";

// Anzeige-Phase eines Spiels aus den TATSÄCHLICH gespeicherten nuLiga-Daten (rein, ohne DB).
//
// Bewusst KEIN verifiziertes "live": Ob ein Spiel gerade läuft, steht in den gespeicherten Daten nicht (der Spielplan
// kennt nur Ergebnis, "Spielbericht genehmigt", Verlegung, Absage). Daraus folgt nur die Vermutung
// `laeuftVermutlich` (siehe unten). Eine geprüfte Live-Quelle (nuScoreLive, noch offen) ersetzt sie später.
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

// Fenster nach dem Anwurf, in dem ein Spiel mit angelegtem Spielbericht und ohne Ergebnis als "läuft vermutlich" gilt.
export const LAUF_FENSTER_MS = 2 * 60 * 60 * 1000;

// Vermutung, KEIN verifizierter Live-Status: Spielbericht ist angelegt (nuLiga zeigt den Link erst dann), es gibt noch
// kein Ergebnis, und der Anwurf liegt höchstens zwei Stunden zurück. Zeit allein genügt nie (ohne Spielbericht bleibt
// ein Spiel "geplant"). Grenzen: ein Spiel, dessen Bericht nicht online geführt wird, wird nie markiert.
export function laeuftVermutlich(s: SpielAnsicht, jetzt: Date): boolean {
  if (spielPhase(s) !== "bericht_angelegt" || !s.beginn) return false;
  const seit = jetzt.getTime() - s.beginn.getTime();
  return seit >= 0 && seit <= LAUF_FENSTER_MS;
}

export function spielPhase(s: SpielAnsicht): SpielPhase {
  if (s.status === "abgesagt") return "abgesagt";
  if (s.status === "nicht_angetreten") return "nicht_angetreten";
  if (KURZ(s)) return s.ergebnisBestaetigt ? "beendet" : "ergebnis_vorlaeufig";
  if (s.status === "verlegt") return "verlegt";
  if (s.meetingId || s.berichtUrl) return "bericht_angelegt";
  return "geplant";
}
