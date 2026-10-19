// Standard der Darstellung, wenn die Person nichts gewählt hat (rein, getestet): der Demo-Verein und Vereine, die ab dem Start des neuen Designs
// angelegt wurden, bekommen das neue App-Design; bestehende Vereine bleiben beim klassischen, bis jemand selbst wechselt.
export const NEUES_DESIGN_AB = new Date("2026-10-19T00:00:00+02:00");

export function istDesignNeu(eigeneWahl: boolean | null, istDemo: boolean, vereinErstelltAm: Date): boolean {
  if (eigeneWahl != null) return eigeneWahl;
  return istDemo || vereinErstelltAm.getTime() >= NEUES_DESIGN_AB.getTime();
}
