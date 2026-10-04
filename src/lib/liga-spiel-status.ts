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

// Fenster nach dem Anwurf, in dem ein Spiel mit angelegtem Spielbericht als "läuft" gilt (Handball: 2 x 30 Min + Pause
// + Auszeiten, Jugend kürzer).
export const LAUF_FENSTER_MS = 90 * 60 * 1000;

// Vermutung, KEIN verifizierter Live-Status: nuLiga zeigt schon während des Spiels den Zwischenstand als
// "vorläufiges" Ergebnis (noch nicht genehmigt). Ein Spiel gilt als laufend, wenn der Spielbericht angelegt ist, das
// Ergebnis fehlt oder noch nicht genehmigt ist und der Anwurf höchstens 90 Min zurückliegt. Zeit allein genügt nie.
// Grenze: ein gerade beendetes, noch nicht genehmigtes Spiel zeigt "Läuft" bis das Fenster abläuft.
export function laeuftVermutlich(s: SpielAnsicht, jetzt: Date): boolean {
  const phase = spielPhase(s);
  if ((phase !== "bericht_angelegt" && phase !== "ergebnis_vorlaeufig") || !s.beginn) return false;
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
