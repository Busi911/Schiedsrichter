// Bewertung "lebt der Verein / ist er korrekt eingerichtet?" für die Systemadmin-Übersicht. Rein (ohne DB), testbar.

export type VereinsKennzahlen = {
  personen: number; // Personen des Vereins (Admins + Funktionsträger)
  admins: number; // volle Vereinsadmins
  mitRolle: number; // Personen mit mindestens einer aktiven Funktionsträger-Rolle
  angemeldet: number; // Personen, die sich schon einmal angemeldet haben
  adminAngemeldet: boolean;
  avvAkzeptiert: boolean;
  mannschaften: number;
  kuenftigeTermine: number;
  zuordnungen30Tage: number;
  oeffentlicheSeite: boolean;
  letzteAktivitaet: Date | null; // max(letzte Aktivität, letzter Login) über alle Personen
  onlineJetzt: number; // Personen mit Aktivität in den letzten 5 Minuten
};

export type Lebenszeichen = "lebt" | "ruhig" | "inaktiv" | "nie";

export const ONLINE_FENSTER_MS = 5 * 60 * 1000;
const TAG_MS = 24 * 60 * 60 * 1000;

// lebt = Aktivität in den letzten 7 Tagen, ruhig = bis 30 Tage, inaktiv = länger, nie = nie benutzt.
export function lebenszeichen(letzteAktivitaet: Date | null, jetzt: Date): Lebenszeichen {
  if (!letzteAktivitaet) return "nie";
  const alter = jetzt.getTime() - letzteAktivitaet.getTime();
  if (alter <= 7 * TAG_MS) return "lebt";
  if (alter <= 30 * TAG_MS) return "ruhig";
  return "inaktiv";
}

export type EinrichtungsPunkt = { schluessel: string; label: string; erfuellt: boolean };

export function einrichtungsPunkte(k: VereinsKennzahlen): EinrichtungsPunkt[] {
  return [
    { schluessel: "admin", label: "Vereinsadmin angelegt", erfuellt: k.admins > 0 },
    { schluessel: "adminLogin", label: "Admin hat sich angemeldet", erfuellt: k.adminAngemeldet },
    { schluessel: "avv", label: "AVV akzeptiert", erfuellt: k.avvAkzeptiert },
    { schluessel: "mannschaften", label: "Mannschaften angelegt", erfuellt: k.mannschaften > 0 },
    { schluessel: "funktionstraeger", label: "Funktionsträger mit Rolle", erfuellt: k.mitRolle > 0 },
    { schluessel: "termine", label: "Künftige Termine vorhanden", erfuellt: k.kuenftigeTermine > 0 },
    { schluessel: "seite", label: "Öffentliche Seite eingerichtet", erfuellt: k.oeffentlicheSeite },
  ];
}

// "gerade eben", "vor 12 Min.", "vor 3 Std.", "vor 5 Tagen" — für die Anzeige.
export function vorZeit(d: Date | null, jetzt: Date): string {
  if (!d) return "nie";
  const min = Math.floor((jetzt.getTime() - d.getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  return tage === 1 ? "vor 1 Tag" : `vor ${tage} Tagen`;
}
