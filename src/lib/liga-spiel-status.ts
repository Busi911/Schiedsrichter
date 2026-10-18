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
// "vorläufiges" Ergebnis (noch nicht genehmigt). Ein Spiel gilt als laufend, wenn das Ergebnis fehlt oder noch nicht
// genehmigt ist, es nicht abgesagt/verlegt ist und der Anwurf höchstens 90 Min zurückliegt. Ein angelegter Spielbericht
// ist NICHT nötig: nuLiga legt ihn oft erst nach dem Anwurf an (bzw. der Sync sieht den Link erst später), das Spiel
// stand dann bis dahin fälschlich als "geplant" da.
// Grenze: ein gerade beendetes, noch nicht genehmigtes Spiel zeigt "Läuft" bis das Fenster abläuft.
export function laeuftVermutlich(s: SpielAnsicht, jetzt: Date): boolean {
  const phase = spielPhase(s);
  if ((phase !== "geplant" && phase !== "bericht_angelegt" && phase !== "ergebnis_vorlaeufig") || !s.beginn) return false;
  const seit = jetzt.getTime() - s.beginn.getTime();
  return seit >= 0 && seit <= LAUF_FENSTER_MS;
}

// Live-Ticker ist nur kurz vor, während und kurz nach dem Spiel interessant: ab 60 Min vor dem Anwurf bis 4 h danach,
// solange das Ergebnis nicht genehmigt ist und das Spiel nicht abgesagt/verlegt ist.
export function liveTickerRelevant(s: SpielAnsicht, jetzt: Date): boolean {
  if (!s.beginn || s.ergebnisBestaetigt || s.status === "abgesagt" || s.status === "verlegt") return false;
  const ab = jetzt.getTime() - s.beginn.getTime();
  return ab >= -60 * 60 * 1000 && ab <= 4 * 60 * 60 * 1000;
}

// Zwischenstand: nuLiga zeigt schon während des Spiels den laufenden Stand als noch nicht genehmigtes Ergebnis, und die
// Spielplan-Spalte kann lange veraltet bleiben (18.10.2026: 8:7 stand als "vorläufig" da, obwohl das Spiel längst 44:24
// geendet hatte). Ob ein nicht genehmigter Stand endgültig ist, sagt nuLiga nicht. Die Seite zeigt deshalb NUR ein
// Endergebnis (genehmigt, Betreiber 18.10.2026): ein nicht genehmigter Stand steht nie als Zahl da ("Läuft gerade" in den
// ersten 90 Min, danach "Ergebnis folgt"), erst nach 12 Stunden als "vorläufig" (z.B. wenn nuLiga ein Spiel nie genehmigt).
export const ZWISCHENSTAND_FENSTER_MS = 12 * 60 * 60 * 1000;

export function istZwischenstand(s: SpielAnsicht, jetzt: Date): boolean {
  if (!KURZ(s) || s.ergebnisBestaetigt || s.status === "nicht_angetreten" || !s.beginn) return false;
  const seit = jetzt.getTime() - s.beginn.getTime();
  return seit >= 0 && seit <= ZWISCHENSTAND_FENSTER_MS;
}

// Läuft vermutlich (höchstens 90 Min nach dem Anwurf) UND hat einen nicht genehmigten Stand: gehört unter "Heute"/"Läuft gerade".
// Danach ist das Spiel vorbei und steht bei den Ergebnissen, mit "Ergebnis folgt" statt der Zahl (istZwischenstand gilt weiter).
export function laeuftMitStand(s: SpielAnsicht, jetzt: Date): boolean {
  return istZwischenstand(s, jetzt) && !!s.beginn && jetzt.getTime() - s.beginn.getTime() <= LAUF_FENSTER_MS;
}

export function spielPhase(s: SpielAnsicht): SpielPhase {
  if (s.status === "abgesagt") return "abgesagt";
  if (s.status === "nicht_angetreten") return "nicht_angetreten";
  if (KURZ(s)) return s.ergebnisBestaetigt ? "beendet" : "ergebnis_vorlaeufig";
  if (s.status === "verlegt") return "verlegt";
  if (s.meetingId || s.berichtUrl) return "bericht_angelegt";
  return "geplant";
}
