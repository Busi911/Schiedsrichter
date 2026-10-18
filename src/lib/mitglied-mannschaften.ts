// Zuordnung Mitglied <-> Mannschaft je Saison (Vereinsverwaltung). Rein, ohne Datenbank.

export const MANNSCHAFT_ROLLEN = { spieler: "Spieler/in", trainer: "Trainer/in", betreuer: "Betreuer/in" } as const;
export type MannschaftRolle = keyof typeof MANNSCHAFT_ROLLEN;

export function istMannschaftRolle(w: string): w is MannschaftRolle {
  return Object.hasOwn(MANNSCHAFT_ROLLEN, w);
}

/** "2026/27": vierstelliges Startjahr, Schrägstrich, die zwei Endziffern des Folgejahres. */
export function istSaisonLabel(w: string): boolean {
  const m = /^(\d{4})\/(\d{2})$/.exec(w);
  return !!m && Number(m[2]) === (Number(m[1]) + 1) % 100;
}

export type ZuordnungEingabe = { mitgliedId: string; mannschaftId: string; saison: string; rolle: string };

export function pruefeZuordnung(e: ZuordnungEingabe): { wert: { mitgliedId: string; mannschaftId: string; saison: string; rolle: MannschaftRolle } } | { fehler: string } {
  const mitgliedId = e.mitgliedId.trim();
  const mannschaftId = e.mannschaftId.trim();
  const saison = e.saison.trim();
  const rolle = e.rolle.trim() || "spieler";
  if (!mitgliedId) return { fehler: "Mitglied fehlt." };
  if (!mannschaftId) return { fehler: "Bitte eine Mannschaft auswählen." };
  if (!istSaisonLabel(saison)) return { fehler: "Die Saison muss die Form 2026/27 haben." };
  if (!istMannschaftRolle(rolle)) return { fehler: "Unbekannte Rolle." };
  return { wert: { mitgliedId, mannschaftId, saison, rolle } };
}

/** Saisons zur Auswahl: die laufende, die nächste und die vorige (neueste zuerst), dazu alle schon verwendeten. */
export function saisonOptionen(aktuell: string, vorhandene: string[]): string[] {
  const start = Number(aktuell.slice(0, 4));
  const label = (j: number) => `${j}/${String((j + 1) % 100).padStart(2, "0")}`;
  const alle = new Set([label(start + 1), aktuell, label(start - 1), ...vorhandene.filter(istSaisonLabel)]);
  return [...alle].sort((a, b) => Number(b.slice(0, 4)) - Number(a.slice(0, 4)));
}
