import { aehnlichkeit, normalisiere } from "./namens-abgleich";

// Ab diesem (symmetrischen) Ähnlichkeitswert gilt ein Personen-Paar als
// mögliches Duplikat — deutlich strenger als VORSCHLAG_SCHWELLE in
// namens-abgleich.ts (0.5): dort geht es um EINEN eingegebenen Namen gegen
// bekannte Kandidaten, hier um alle Paare der gesamten Vereins-Liste. Bei
// 0.5 (ein gemeinsames Wort von zweien reicht) würden z.B. "Alexander Gehle"
// und "Alexander Hergert" schon als Duplikat markiert, nur weil beide
// "Alexander" heißen — 0.75 verlangt praktisch eine Übereinstimmung in
// BEIDEN Namens-Wörtern (ggf. mit einzelnem Tippfehler, siehe
// woerterPassenZusammen), erkennt also im Kern denselben vollen Namen unter
// zwei Accounts.
const DUPLIKAT_SCHWELLE = 0.75;

// aehnlichkeit() ist gerichtet (eingegeben → Kandidat, siehe dortiger
// Kommentar) — für den Vergleich zweier gleichberechtigter Namen hier das
// striktere Minimum beider Richtungen, damit z.B. ein einzelnes Wort gegen
// einen vollen Namen (asymmetrischer Treffer) nicht fälschlich als
// Duplikat durchgeht.
function namenAehnlichkeitSymmetrisch(a: string, b: string): number {
  const na = normalisiere(a);
  const nb = normalisiere(b);
  return Math.min(aehnlichkeit(na, nb), aehnlichkeit(nb, na));
}

export type FunktionstraegerDuplikatKandidat = {
  userId: string;
  name: string | null;
};

// Reine Matching-Logik (ohne DB-Zugriff, wie findeDuplikatPaare in
// duplikat-erkennung.ts) — der Aufrufer (admin/funktionstraeger/page.tsx)
// hat die Personen-Liste ohnehin schon für die Tabelle geladen, ein
// zusätzlicher DB-Roundtrip wäre hier unnötig. Generisch über T, damit der
// Aufrufer am gefundenen Paar mehr als nur userId/name weiterreichen kann
// (Rollen, letzter Login, ...) für die Anzeige.
export function findeFunktionstraegerDuplikate<
  T extends FunktionstraegerDuplikatKandidat,
>(personen: T[]): [T, T][] {
  const treffer: [T, T][] = [];
  for (let i = 0; i < personen.length; i++) {
    const a = personen[i];
    if (!a.name) continue;
    for (let j = i + 1; j < personen.length; j++) {
      const b = personen[j];
      if (!b.name) continue;
      if (namenAehnlichkeitSymmetrisch(a.name, b.name) >= DUPLIKAT_SCHWELLE) {
        treffer.push([a, b]);
      }
    }
  }
  return treffer;
}
