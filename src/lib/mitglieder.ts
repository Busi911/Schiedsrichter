// Mitgliederverwaltung (Vereinsverwaltung, Phase 2): Prüfung der Eingaben und Filter der Liste. Rein, ohne Datenbank.

export const STATI = { aktiv: "Aktiv", passiv: "Passiv", ausgetreten: "Ausgetreten" } as const;
export type MitgliedStatus = keyof typeof STATI;
export const GESCHLECHTER = { m: "Männlich", w: "Weiblich", divers: "Divers" } as const;
export type Geschlecht = keyof typeof GESCHLECHTER;

export function istStatus(w: string): w is MitgliedStatus {
  return Object.hasOwn(STATI, w);
}
export function istGeschlecht(w: string): w is Geschlecht {
  return Object.hasOwn(GESCHLECHTER, w);
}

export type MitgliedEingabe = {
  name: string;
  vorname: string;
  geburtsdatum: string;
  email: string;
  telefon: string;
  geschlecht: string;
  status: string;
  eintrittsdatum: string;
  austrittsdatum: string;
  bemerkung: string;
};

export type GeprueftesMitglied = {
  name: string;
  vorname: string;
  geburtsdatum: string | null;
  email: string | null;
  telefon: string | null;
  geschlecht: Geschlecht | null;
  status: MitgliedStatus;
  eintrittsdatum: string | null;
  austrittsdatum: string | null;
  bemerkung: string | null;
};

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export function istEchtesDatum(w: string): boolean {
  if (!DATUM.test(w)) return false;
  const d = new Date(`${w}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === w;
}

/** Heute als "YYYY-MM-DD" in deutscher Zeit. */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
}

export function pruefeMitglied(e: MitgliedEingabe, heute: string = heuteBerlin()): { wert: GeprueftesMitglied } | { fehler: string } {
  const name = e.name.trim();
  const vorname = e.vorname.trim();
  if (!name || !vorname) return { fehler: "Vor- und Nachname sind Pflicht." };
  if (name.length > 100 || vorname.length > 100) return { fehler: "Name ist zu lang (höchstens 100 Zeichen)." };

  const email = e.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { fehler: "Die E-Mail-Adresse ist ungültig." };
  const status = e.status.trim() || "aktiv";
  if (!istStatus(status)) return { fehler: "Unbekannter Status." };
  const geschlecht = e.geschlecht.trim();
  if (geschlecht && !istGeschlecht(geschlecht)) return { fehler: "Unbekanntes Geschlecht." };

  const geburtsdatum = e.geburtsdatum.trim();
  if (geburtsdatum) {
    if (!istEchtesDatum(geburtsdatum)) return { fehler: "Das Geburtsdatum ist ungültig." };
    if (geburtsdatum > heute) return { fehler: "Das Geburtsdatum liegt in der Zukunft." };
  }
  const eintritt = e.eintrittsdatum.trim();
  if (eintritt && !istEchtesDatum(eintritt)) return { fehler: "Das Eintrittsdatum ist ungültig." };
  let austritt = e.austrittsdatum.trim();
  if (austritt && !istEchtesDatum(austritt)) return { fehler: "Das Austrittsdatum ist ungültig." };
  // Ein ausgetretenes Mitglied hat immer ein Austrittsdatum (Standard heute); ein anderer Status hat keines.
  if (status === "ausgetreten" && !austritt) austritt = heute;
  if (status !== "ausgetreten") austritt = "";
  if (eintritt && austritt && austritt < eintritt) return { fehler: "Der Austritt liegt vor dem Eintritt." };

  return {
    wert: {
      name,
      vorname,
      geburtsdatum: geburtsdatum || null,
      email: email || null,
      telefon: e.telefon.trim().slice(0, 50) || null,
      geschlecht: geschlecht ? (geschlecht as Geschlecht) : null,
      status,
      eintrittsdatum: eintritt || null,
      austrittsdatum: austritt || null,
      bemerkung: e.bemerkung.trim().slice(0, 2000) || null,
    },
  };
}

type Listenzeile = { name: string; vorname: string; email: string | null; status: string };

/** Suche über Vor-/Nachname und E-Mail (Groß-/Kleinschreibung egal), dazu optional ein Status. Sortiert nach Nachname, Vorname. */
export function filtereMitglieder<T extends Listenzeile>(liste: T[], suche: string, status: string): T[] {
  const begriffe = suche.toLowerCase().split(/\s+/).filter(Boolean);
  return liste
    .filter((m) => (istStatus(status) ? m.status === status : true))
    .filter((m) => {
      const heu = `${m.vorname} ${m.name} ${m.email ?? ""}`.toLowerCase();
      return begriffe.every((b) => heu.includes(b));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de") || a.vorname.localeCompare(b.vorname, "de"));
}

export function zaehleNachStatus(liste: { status: string }[]): Record<MitgliedStatus, number> {
  const z: Record<MitgliedStatus, number> = { aktiv: 0, passiv: 0, ausgetreten: 0 };
  for (const m of liste) if (istStatus(m.status)) z[m.status]++;
  return z;
}
