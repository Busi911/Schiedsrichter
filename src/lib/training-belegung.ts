// Reine Regeln für das Belegen frei gewordener Trainingszeiten (ohne DB, getestet in training-belegung.test.ts): wer darf eine freie Zeit für welche Mannschaft belegen,
// wer eine Belegung wieder aufheben. Grundlage: training_ausfall (die Zeit ist frei) und training_belegung (eine andere Mannschaft hat sie). Wer zuerst bucht, bekommt sie.

export type BelegungRechte = {
  istAdmin: boolean;
  // Mannschaften, für die die Person als aktiver Trainer eingetragen ist
  trainerMannschaftIds: string[];
};

// Für welche Mannschaften darf die Person die freie Zeit buchen? Admins für jede andere Mannschaft, Trainer für ihre eigenen — nie für die Mannschaft, die ausfällt (die
// meldet den Ausfall einfach zurück).
export function belegbareMannschaften(rechte: BelegungRechte, alleMannschaftIds: string[], ausfallMannschaftId: string): string[] {
  const kandidaten = rechte.istAdmin ? alleMannschaftIds : rechte.trainerMannschaftIds.filter((id) => alleMannschaftIds.includes(id));
  return kandidaten.filter((id) => id !== ausfallMannschaftId);
}

export function darfBelegen(rechte: BelegungRechte, alleMannschaftIds: string[], ausfallMannschaftId: string, zielMannschaftId: string): boolean {
  return belegbareMannschaften(rechte, alleMannschaftIds, ausfallMannschaftId).includes(zielMannschaftId);
}

// Aufheben dürfen Admins und Trainer der buchenden Mannschaft.
export function darfBelegungAufheben(rechte: BelegungRechte, belegungMannschaftId: string): boolean {
  return rechte.istAdmin || rechte.trainerMannschaftIds.includes(belegungMannschaftId);
}

// Den Ausfall zurücknehmen ("findet doch statt") geht nur, solange die Zeit nicht belegt ist — außer ein Admin entscheidet (dann entfällt die Belegung).
export function ausfallRuecknahmeErlaubt(istBelegt: boolean, istAdmin: boolean): boolean {
  return !istBelegt || istAdmin;
}
