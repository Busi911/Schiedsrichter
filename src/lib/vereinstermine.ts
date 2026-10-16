// Reine Regeln für Vereinstermine (Sitzungen u.ä., ohne DB, getestet in vereinstermine.test.ts): wer einen Termin sieht, Prüfung der Eingabe,
// Zusammenfassung der Antworten, was sich geändert hat. Tabellen: vereinstermin, vereinstermin_sichtbar, vereinstermin_antwort.

export const ARTEN = {
  sitzung: "Sitzung",
  versammlung: "Versammlung",
  arbeitseinsatz: "Arbeitseinsatz",
  veranstaltung: "Veranstaltung",
  sonstiges: "Sonstiges",
} as const;
export type Art = keyof typeof ARTEN;
export const istArt = (x: string): x is Art => Object.hasOwn(ARTEN, x);

export const SICHTBARKEITEN = {
  alle: "Alle im Verein",
  admins: "Nur Vereinsadmins",
  auswahl: "Auswahl (Rollen und/oder Personen)",
} as const;
export type Sichtbarkeit = keyof typeof SICHTBARKEITEN;
export const istSichtbarkeit = (x: string): x is Sichtbarkeit => Object.hasOwn(SICHTBARKEITEN, x);

// Rollen, nach denen ein Termin eingeschränkt werden kann. Schlüssel steht in vereinstermin_sichtbar.rolle; "zeitnehmer_sekretaer" und "warte" fassen mehrere
// echte Rollen (funktionstraeger_rolle.typ) zusammen.
export const ROLLEN = {
  trainer: { label: "Trainer", typen: ["trainer"] },
  schiedsrichter: { label: "Schiedsrichter", typen: ["schiedsrichter"] },
  zeitnehmer_sekretaer: { label: "Zeitnehmer/Sekretär", typen: ["zeitnehmer", "sekretaer"] },
  ordner: { label: "Ordner", typen: ["ordner"] },
  kioskdienst: { label: "Kioskdienst", typen: ["kioskdienst"] },
  kassierer: { label: "Kassierer", typen: ["kassierer"] },
  warte: { label: "Warte (Schiedsrichter-, Zeitnehmer-, Ordner-, Dienstwart)", typen: ["schiedsrichterwart", "zeitnehmerwart", "ordnerwart", "dienstwart"] },
} as const;
export type RollenSchluessel = keyof typeof ROLLEN;
export const istRollenSchluessel = (x: string): x is RollenSchluessel => Object.hasOwn(ROLLEN, x);

export const ANTWORTEN = { zusage: "Zusage", vielleicht: "Vielleicht", absage: "Absage" } as const;
export type Antwort = keyof typeof ANTWORTEN;
export const istAntwort = (x: string): x is Antwort => Object.hasOwn(ANTWORTEN, x);

export type TerminSichtbarkeit = { sichtbarkeit: string; rollen: string[]; personen: string[] };
export type Person = { userId: string; istAdmin: boolean; rollenTypen: string[] };

// Admins (auch "nur lesend") sehen jeden Vereinstermin. Sonst: "alle" jede Person, "admins" niemand weiter, "auswahl" wer eine der Rollen aktiv hat oder
// namentlich gewählt ist.
export function darfVereinsterminSehen(t: TerminSichtbarkeit, p: Person): boolean {
  if (p.istAdmin) return true;
  if (t.sichtbarkeit === "alle") return true;
  if (t.sichtbarkeit !== "auswahl") return false;
  if (t.personen.includes(p.userId)) return true;
  return t.rollen.some((r) => istRollenSchluessel(r) && ROLLEN[r].typen.some((typ) => p.rollenTypen.includes(typ)));
}

// Zu-/Absage nur, solange der Termin noch nicht begonnen hat.
export function antwortNochMoeglich(start: Date, jetzt: Date): boolean {
  return start.getTime() > jetzt.getTime();
}

export type TerminEingabe = {
  titel: string;
  art: string;
  beschreibung: string;
  ort: string;
  start: Date | null;
  ende: Date | null;
  sichtbarkeit: string;
  rollen: string[];
  personen: string[];
};
export type GepruefterTermin = {
  titel: string;
  art: Art;
  beschreibung: string | null;
  ort: string | null;
  start: Date;
  ende: Date | null;
  sichtbarkeit: Sichtbarkeit;
  rollen: RollenSchluessel[];
  personen: string[];
};

export function pruefeVereinstermin(e: TerminEingabe): { fehler: string } | { wert: GepruefterTermin } {
  const titel = e.titel.trim();
  if (!titel) return { fehler: "Bitte einen Titel angeben." };
  if (titel.length > 120) return { fehler: "Der Titel darf höchstens 120 Zeichen lang sein." };
  if (!istArt(e.art)) return { fehler: "Ungültige Art." };
  if (!e.start || Number.isNaN(e.start.getTime())) return { fehler: "Bitte Beginn angeben." };
  if (e.ende && (Number.isNaN(e.ende.getTime()) || e.ende.getTime() < e.start.getTime())) return { fehler: "Das Ende liegt vor dem Beginn." };
  if (!istSichtbarkeit(e.sichtbarkeit)) return { fehler: "Ungültige Sichtbarkeit." };
  const beschreibung = e.beschreibung.trim();
  if (beschreibung.length > 2000) return { fehler: "Die Beschreibung ist zu lang (höchstens 2000 Zeichen)." };
  const ort = e.ort.trim();
  const rollen = [...new Set(e.rollen)].filter(istRollenSchluessel);
  const personen = [...new Set(e.personen.filter(Boolean))];
  if (e.sichtbarkeit === "auswahl" && rollen.length === 0 && personen.length === 0) {
    return { fehler: "Bei „Auswahl“ bitte mindestens eine Rolle oder Person wählen." };
  }
  return {
    wert: {
      titel,
      art: e.art,
      beschreibung: beschreibung || null,
      ort: ort || null,
      start: e.start,
      ende: e.ende,
      sichtbarkeit: e.sichtbarkeit,
      // Auswahl nur bei "auswahl" speichern: sonst blieben alte Häkchen unsichtbar hängen.
      rollen: e.sichtbarkeit === "auswahl" ? rollen : [],
      personen: e.sichtbarkeit === "auswahl" ? personen : [],
    },
  };
}

export type AntwortZeile = { userId: string; antwort: string };
export type Antwortzahlen = { zusage: number; vielleicht: number; absage: number; offen: number };

// Zahlen für die Übersicht: wer aus der Zielgruppe noch nicht geantwortet hat, zählt als "offen". Antworten von Personen außerhalb der Zielgruppe
// (z.B. nach einer geänderten Sichtbarkeit) zählen als Antwort, verändern "offen" aber nicht.
export function fasseAntwortenZusammen(zielgruppeIds: string[], antworten: AntwortZeile[]): Antwortzahlen {
  const zahlen: Antwortzahlen = { zusage: 0, vielleicht: 0, absage: 0, offen: 0 };
  const geantwortet = new Set<string>();
  for (const a of antworten) {
    if (!istAntwort(a.antwort)) continue;
    zahlen[a.antwort]++;
    geantwortet.add(a.userId);
  }
  zahlen.offen = zielgruppeIds.filter((id) => !geantwortet.has(id)).length;
  return zahlen;
}

export type TerminKern = { titel: string; start: Date; ende: Date | null; ort: string | null };

// Was sich so geändert hat, dass es in die Info-Mail gehört (Beschreibung und Sichtbarkeit nicht).
export function aenderungen(alt: TerminKern, neu: TerminKern): string[] {
  const liste: string[] = [];
  if (alt.titel !== neu.titel) liste.push("Titel");
  if (alt.start.getTime() !== neu.start.getTime()) liste.push("Beginn");
  if ((alt.ende?.getTime() ?? null) !== (neu.ende?.getTime() ?? null)) liste.push("Ende");
  if ((alt.ort ?? "") !== (neu.ort ?? "")) liste.push("Ort");
  return liste;
}

// "Anstehend" = noch nicht vorbei: bis zum Ende, ohne Ende zwei Stunden nach Beginn (ein laufender Termin bleibt oben).
export function istAnstehend(t: { start: Date; ende: Date | null }, jetzt: Date): boolean {
  const ende = t.ende ?? new Date(t.start.getTime() + 2 * 60 * 60 * 1000);
  return ende.getTime() >= jetzt.getTime();
}
