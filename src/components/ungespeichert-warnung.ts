"use client";

import { useState } from "react";

export const VERWERFEN_FRAGE = "Eingaben verwerfen? Ungespeicherte Änderungen gehen verloren.";

// Merkt, ob in einem Formular-Dialog schon etwas eingegeben/geändert wurde (`onInput` am Dialog-Inhalt), und fragt vor dem
// Schließen nach (Klick daneben, Esc, Schließen-Knopf), damit eine ausgefüllte Eingabe nicht versehentlich verloren geht.
// Nach dem Speichern `zuruecksetzen()` aufrufen, dann schließt der Dialog ohne Rückfrage.
export function useUngespeichertWarnung() {
  const [geaendert, setGeaendert] = useState(false);
  return {
    geaendert,
    markiereGeaendert: () => setGeaendert(true),
    zuruecksetzen: () => setGeaendert(false),
    /** true = Dialog darf schließen (nichts geändert oder der Nutzer hat „Verwerfen“ bestätigt). */
    darfSchliessen: () => !geaendert || window.confirm(VERWERFEN_FRAGE),
  };
}
