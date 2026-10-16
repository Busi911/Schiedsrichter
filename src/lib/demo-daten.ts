// Reine Beschreibung der Testdaten des öffentlichen Demo-Vereins (siehe lib/demo-verein.ts, /demo): Personen, Mannschaften, Termine und
// Besetzung, bewusst OHNE Datenbankzugriff — dadurch testbar (demo-daten.test.ts) und leicht zu ändern. Alle Zeiten sind relativ zu "jetzt",
// damit die Demo nach jedem nächtlichen Zurücksetzen wieder lauter künftige Spiele zeigt.
//
// Ziel der Demo: den Teil "Einteilung der Ehrenamtlichen" zeigen — Spiele mit unterschiedlichem Besetzungsstand (voll, teils, leer), ein
// Turnier mit hohem Bedarf, offene Selbsteintragungen zum Bestätigen, eine Abmeldeanfrage und eine deaktivierte Person (Aktivieren & zuordnen).
// Alle Namen und Adressen sind erfunden; E-Mail-Adressen liegen unter demo.handballerpate.de (an diese Domain gehen nie Mails: der Demo-Verein
// steht dauerhaft im Vorbereitungs-Modus, siehe istEmpfaengerGesperrt).

export const DEMO_EMAIL_DOMAIN = "demo.handballerpate.de";

// Im Demo-Verein eingegebene E-Mail-Adressen (Funktionsträger anlegen/ändern, Excel-Import, Zeitnehmer-/Ordnerwart) werden NIE gespeichert, sondern
// auf eine erfundene Adresse unter DEMO_EMAIL_DOMAIN abgebildet: sonst könnte jeder Besucher über die Demo prüfen, welche Adressen registriert sind
// ("bereits einem anderen Verein zugeordnet"), echte Adressen bis zum Zurücksetzen blockieren (user.email ist systemweit eindeutig) oder über
// "E-Mail-Adresse geändert" Mails an fremde Adressen auslösen. Deterministisch (gleiche Eingabe = gleiche Person), Adressen der Demo-Domain bleiben.
export function demoErsatzAdresse(email: string): string {
  const e = email.trim().toLowerCase();
  if (istDemoAdresse(e)) return e;
  // FNV-1a (32 Bit): kein Schutzzweck, nur damit verschiedene Eingaben verschiedene Personen bleiben.
  let h = 0x811c9dc5;
  for (let i = 0; i < e.length; i++) {
    h ^= e.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const lokal = (e.split("@")[0] ?? "").replace(/[^a-z0-9._-]/g, "").slice(0, 30) || "person";
  return `${lokal}-${h.toString(16).padStart(8, "0")}@${DEMO_EMAIL_DOMAIN}`;
}

export function istDemoAdresse(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export type DemoRolleTyp =
  | "schiedsrichter"
  | "zeitnehmer"
  | "sekretaer"
  | "trainer"
  | "ordner"
  | "kioskdienst"
  | "kassierer"
  | "schiedsrichterwart"
  | "zeitnehmerwart"
  | "ordnerwart"
  | "dienstwart";

export type DemoPerson = {
  key: string;
  name: string;
  rollen: { typ: DemoRolleTyp; mannschaft?: string; lizenzTage?: number; aktiv?: boolean }[];
};

export type DemoTermin = {
  key: string;
  typ: "rundenspiel" | "testspiel" | "turnier" | "auswaertsspiel";
  tage: number; // Tage ab heute (negativ = vergangen)
  stunde: number;
  minute?: number;
  dauerMinuten: number;
  mannschaft: string;
  beschreibung: string;
  pflichtspiel?: boolean;
  heim?: string;
  gast?: string;
  ergebnis?: [number, number];
  ort?: string; // Standard: eigene Halle; Auswärtsspiele in der Halle des Gegners
};

export type DemoZuordnung = {
  termin: string;
  typ: DemoRolleTyp;
  person?: string; // Schlüssel einer Person
  externerName?: string; // Selbsteintragung ohne Zuordnung (zur Bestätigung durch den Wart)
  vorschlag?: string; // Schlüssel der vorgeschlagenen Person (Namensabgleich)
  quelle: "zugeordnet_durch_admin" | "selbst_angemeldet" | "selbst_eingetragen_oeffentlich";
  abmeldung?: boolean; // Person hat sich zur Abmeldung gemeldet
};

const MANNSCHAFTEN = [
  { name: "1. Herren", altersklasse: "Herren" },
  { name: "2. Herren", altersklasse: "Herren" },
  { name: "1. Damen", altersklasse: "Damen" },
  { name: "männliche A-Jugend", altersklasse: "mA" },
  { name: "männliche B-Jugend", altersklasse: "mB" },
  { name: "weibliche B-Jugend", altersklasse: "wB" },
  { name: "weibliche C-Jugend", altersklasse: "wC" },
  { name: "männliche D-Jugend", altersklasse: "mD" },
];

const PERSONEN: DemoPerson[] = [
  {
    key: "anna",
    name: "Anna Admin",
    rollen: [{ typ: "schiedsrichterwart" }, { typ: "zeitnehmerwart" }, { typ: "ordnerwart" }, { typ: "dienstwart" }],
  },
  { key: "thomas", name: "Thomas Bauer", rollen: [{ typ: "schiedsrichter", lizenzTage: 200 }] },
  { key: "julia", name: "Julia Becker", rollen: [{ typ: "schiedsrichter", lizenzTage: 25 }] },
  { key: "markus", name: "Markus Fischer", rollen: [{ typ: "schiedsrichter", lizenzTage: 400 }] },
  { key: "laura", name: "Laura Hoffmann", rollen: [{ typ: "zeitnehmer" }, { typ: "sekretaer" }] },
  { key: "sven", name: "Sven Wagner", rollen: [{ typ: "zeitnehmer" }, { typ: "sekretaer" }] },
  { key: "petra", name: "Petra Zimmermann", rollen: [{ typ: "zeitnehmer" }, { typ: "sekretaer" }] },
  { key: "jonas", name: "Jonas Krüger", rollen: [{ typ: "zeitnehmer" }, { typ: "sekretaer" }] },
  { key: "nina", name: "Nina Schulz", rollen: [{ typ: "ordner" }] },
  { key: "tim", name: "Tim Köhler", rollen: [{ typ: "ordner" }] },
  { key: "hannah", name: "Hannah Lange", rollen: [{ typ: "ordner" }] },
  { key: "felix", name: "Felix Braun", rollen: [{ typ: "ordner" }] },
  { key: "paul", name: "Paul Richter", rollen: [{ typ: "kioskdienst" }] },
  { key: "marie", name: "Marie Vogel", rollen: [{ typ: "kioskdienst" }] },
  { key: "lena", name: "Lena Schmitt", rollen: [{ typ: "kioskdienst" }] },
  { key: "oliver", name: "Oliver Hartmann", rollen: [{ typ: "kioskdienst" }] },
  { key: "katrin", name: "Katrin Weber", rollen: [{ typ: "kassierer" }] },
  { key: "dieter", name: "Dieter Kramer", rollen: [{ typ: "kassierer" }] },
  { key: "michael", name: "Michael Schäfer", rollen: [{ typ: "trainer", mannschaft: "1. Herren" }] },
  { key: "sabine", name: "Sabine Klein", rollen: [{ typ: "trainer", mannschaft: "1. Damen" }] },
  { key: "jan", name: "Jan Berger", rollen: [{ typ: "trainer", mannschaft: "männliche B-Jugend" }] },
  // Seit der letzten Saison deaktiviert — zeigt "Aktivieren & zuordnen", wenn sie sich wieder einträgt.
  { key: "heike", name: "Heike Neumann", rollen: [{ typ: "ordner", aktiv: false }] },
];

export const DEMO_ADMIN = { key: "anna", name: "Anna Admin" };

const TERMINE: DemoTermin[] = [
  { key: "t0", typ: "rundenspiel", tage: -3, stunde: 15, dauerMinuten: 90, mannschaft: "1. Herren", beschreibung: "HSG Musterstadt - SG Waldstadt", pflichtspiel: true, heim: "HSG Musterstadt", gast: "SG Waldstadt", ergebnis: [28, 24] },
  { key: "t1", typ: "rundenspiel", tage: 2, stunde: 15, dauerMinuten: 90, mannschaft: "1. Herren", beschreibung: "HSG Musterstadt - HSG Nachbarstadt", pflichtspiel: true, heim: "HSG Musterstadt", gast: "HSG Nachbarstadt" },
  { key: "t2", typ: "rundenspiel", tage: 3, stunde: 17, dauerMinuten: 90, mannschaft: "1. Damen", beschreibung: "HSG Musterstadt - TV Bergheim", pflichtspiel: true, heim: "HSG Musterstadt", gast: "TV Bergheim" },
  { key: "t3", typ: "rundenspiel", tage: 3, stunde: 14, dauerMinuten: 75, mannschaft: "männliche B-Jugend", beschreibung: "HSG Musterstadt - TSV Ostheim", pflichtspiel: true, heim: "HSG Musterstadt", gast: "TSV Ostheim" },
  { key: "t4", typ: "testspiel", tage: 5, stunde: 11, dauerMinuten: 90, mannschaft: "männliche A-Jugend", beschreibung: "Testspiel gegen SG Talblick" },
  { key: "t5", typ: "rundenspiel", tage: 9, stunde: 16, dauerMinuten: 90, mannschaft: "2. Herren", beschreibung: "HSG Musterstadt II - SV Grünau", pflichtspiel: true, heim: "HSG Musterstadt II", gast: "SV Grünau" },
  { key: "t6", typ: "rundenspiel", tage: 10, stunde: 17, dauerMinuten: 90, mannschaft: "1. Damen", beschreibung: "HSG Musterstadt - SC Hochfeld", pflichtspiel: true, heim: "HSG Musterstadt", gast: "SC Hochfeld" },
  { key: "t7", typ: "turnier", tage: 12, stunde: 9, dauerMinuten: 480, mannschaft: "weibliche C-Jugend", beschreibung: "Jugend-Hallenturnier" },
  { key: "t8", typ: "rundenspiel", tage: 16, stunde: 15, dauerMinuten: 90, mannschaft: "1. Herren", beschreibung: "HSG Musterstadt - TV Bergheim", pflichtspiel: true, heim: "HSG Musterstadt", gast: "TV Bergheim" },
  { key: "t9", typ: "rundenspiel", tage: 17, stunde: 13, dauerMinuten: 75, mannschaft: "weibliche B-Jugend", beschreibung: "HSG Musterstadt - SG Waldstadt", pflichtspiel: true, heim: "HSG Musterstadt", gast: "SG Waldstadt" },
  { key: "t10", typ: "rundenspiel", tage: 17, stunde: 15, minute: 30, dauerMinuten: 75, mannschaft: "männliche D-Jugend", beschreibung: "HSG Musterstadt - TSV Ostheim", pflichtspiel: true, heim: "HSG Musterstadt", gast: "TSV Ostheim" },
  { key: "t11", typ: "testspiel", tage: 20, stunde: 18, dauerMinuten: 90, mannschaft: "1. Damen", beschreibung: "Testspiel gegen HC Rheintal" },
  { key: "t12", typ: "rundenspiel", tage: 23, stunde: 15, dauerMinuten: 90, mannschaft: "1. Herren", beschreibung: "HSG Musterstadt - SV Grünau", pflichtspiel: true, heim: "HSG Musterstadt", gast: "SV Grünau" },
  // Auswärtsspiele: im echten Betrieb automatisch aus dem Spielplan, sobald ein Dienst mit Auswärts-Bedarf gilt (hier: Fahrer).
  { key: "t14", typ: "auswaertsspiel", tage: 6, stunde: 14, dauerMinuten: 90, mannschaft: "männliche A-Jugend", beschreibung: "SG Talblick - HSG Musterstadt", pflichtspiel: true, heim: "SG Talblick", gast: "HSG Musterstadt", ort: "Sporthalle Talblick" },
  { key: "t15", typ: "auswaertsspiel", tage: 13, stunde: 11, dauerMinuten: 75, mannschaft: "weibliche C-Jugend", beschreibung: "TV Bergheim - HSG Musterstadt", pflichtspiel: true, heim: "TV Bergheim", gast: "HSG Musterstadt", ort: "Bergheimhalle" },
  { key: "t13", typ: "rundenspiel", tage: 24, stunde: 17, dauerMinuten: 90, mannschaft: "2. Herren", beschreibung: "HSG Musterstadt II - SC Hochfeld", pflichtspiel: true, heim: "HSG Musterstadt II", gast: "SC Hochfeld" },
];

const ADMIN_ZUORDNUNG = "zugeordnet_durch_admin" as const;
const z = (termin: string, typ: DemoRolleTyp, person: string, quelle: DemoZuordnung["quelle"] = ADMIN_ZUORDNUNG): DemoZuordnung => ({ termin, typ, person, quelle });

const ZUORDNUNGEN: DemoZuordnung[] = [
  // t1: vollständig besetzt (Zeitnehmer + Sekretär, 2 Ordner, 2 Kiosk, Kasse), eine Ordnerin hat sich selbst angemeldet
  z("t1", "zeitnehmer", "laura"),
  z("t1", "sekretaer", "sven"),
  z("t1", "ordner", "nina", "selbst_angemeldet"),
  z("t1", "ordner", "tim"),
  z("t1", "kioskdienst", "paul"),
  z("t1", "kioskdienst", "marie"),
  z("t1", "kassierer", "katrin"),
  // t2: teilweise besetzt — Ordner und Kasse fehlen noch; eine Abmeldeanfrage wartet auf den Wart
  z("t2", "zeitnehmer", "petra"),
  z("t2", "sekretaer", "jonas"),
  z("t2", "ordner", "hannah"),
  { ...z("t2", "kioskdienst", "lena"), abmeldung: true },
  // t3: nur Zeitnehmer/Sekretär, der Rest offen
  z("t3", "zeitnehmer", "laura"),
  z("t3", "sekretaer", "sven"),
  // t4: Testspiel — der Verein stellt Schiedsrichter (Gespann) und Helfer
  z("t4", "schiedsrichter", "thomas"),
  z("t4", "schiedsrichter", "markus"),
  z("t4", "zeitnehmer", "jonas"),
  z("t4", "sekretaer", "petra"),
  z("t4", "ordner", "felix"),
  z("t4", "kioskdienst", "oliver"),
  // t6: halb besetzt
  z("t6", "zeitnehmer", "sven"),
  z("t6", "ordner", "nina"),
  z("t6", "kioskdienst", "paul"),
  // t7: Turnier mit hohem Bedarf — erst wenige Zusagen
  z("t7", "ordner", "tim"),
  z("t7", "ordner", "felix"),
  z("t7", "kioskdienst", "marie"),
  z("t7", "kassierer", "dieter"),
  // t8: Zeitnehmer da, der Rest offen
  z("t8", "zeitnehmer", "laura"),
  z("t8", "sekretaer", "jonas"),
  // t5, t9, t10, t11, t12, t13: bewusst leer (offene Dienste zum Verteilen)
  // Öffentliche Selbsteintragung zum Bestätigen (siehe /profil/ordnerwart und /profil/zeitnehmerwart):
  { termin: "t3", typ: "ordner", externerName: "Sandra Meier", quelle: "selbst_eingetragen_oeffentlich" },
  { termin: "t5", typ: "kioskdienst", externerName: "Lena Schmid", vorschlag: "lena", quelle: "selbst_eingetragen_oeffentlich" },
  { termin: "t9", typ: "ordner", externerName: "Heike Neumann", quelle: "selbst_eingetragen_oeffentlich" },
  { termin: "t12", typ: "zeitnehmer", externerName: "Petra Zimmerman", vorschlag: "petra", quelle: "selbst_eingetragen_oeffentlich" },
];

// Eigene Dienste des Vereins (Einstellungen → Dienste) und ihre Einteilungen (Seite Dienstwart).
export type DemoEigenerDienst = {
  key: string;
  name: string;
  beschreibung?: string;
  // Bedarf je Veranstaltung (0 = gilt dort nicht), wie in Einstellungen → Dienste
  bedarf: { heim: number; auswaerts: number; freundschaft: number; turnier: number };
  mannschaften?: string[]; // nur diese (sonst alle)
  fahrgemeinschaft?: boolean; // Plätze je Auto + Mitfahrer (lib/fahrgemeinschaft.ts)
};
export type DemoEigeneEinteilung = {
  termin: string;
  dienst: string;
  person?: string;
  externerName?: string;
  abmeldung?: boolean;
  // Fahrgemeinschaft: freie Plätze, Treffpunkt und Mitfahrer (nur Namen)
  plaetze?: number;
  fahrtHinweis?: string;
  mitfahrer?: string[];
};

const EIGENE_DIENSTE: DemoEigenerDienst[] = [
  { key: "kuchen", name: "Kuchen", beschreibung: "Bitte bis 30 Minuten vor Anwurf am Kiosk abgeben.", bedarf: { heim: 2, auswaerts: 0, freundschaft: 0, turnier: 2 } },
  {
    key: "fahrer",
    name: "Fahrer",
    beschreibung: "Treffpunkt 45 Minuten vor Anwurf an der Halle.",
    bedarf: { heim: 0, auswaerts: 2, freundschaft: 2, turnier: 3 },
    fahrgemeinschaft: true,
    mannschaften: ["männliche A-Jugend", "weibliche C-Jugend"],
  },
];

const EIGENE_EINTEILUNGEN: DemoEigeneEinteilung[] = [
  // t1 vollständig (2 Kuchen), t2 eine Abmeldeanfrage, t4 Fahrer teilweise, t7 Turnier: Kuchen und Fahrer offen
  { termin: "t1", dienst: "kuchen", externerName: "Familie Roth" },
  { termin: "t1", dienst: "kuchen", person: "marie" },
  { termin: "t2", dienst: "kuchen", person: "sabine", abmeldung: true },
  { termin: "t4", dienst: "fahrer", person: "jan" },
  { termin: "t4", dienst: "fahrer", externerName: "Opa Heinz" },
  { termin: "t7", dienst: "fahrer", externerName: "Familie Yilmaz" },
  // Auswärtsspiele: t14 vollständig, t15 noch ein Fahrer offen
  // Fahrgemeinschaft: t14 Jan mit 3 Plätzen (2 belegt), Familie Roth mit 2 Plätzen (voll); t15 Marie hat noch keine Plätze angegeben
  { termin: "t14", dienst: "fahrer", person: "jan", plaetze: 3, fahrtHinweis: "Treffpunkt Halle 12:45", mitfahrer: ["Lena", "Paul"] },
  { termin: "t14", dienst: "fahrer", externerName: "Familie Roth", plaetze: 2, mitfahrer: ["Mia", "Noah"] },
  { termin: "t15", dienst: "fahrer", person: "marie" },
];

export type DemoVereinstermin = {
  art: string;
  titel: string;
  tage: number;
  stunde: number;
  dauerMinuten: number;
  ort: string;
  beschreibung: string;
  sichtbarkeit: "alle" | "admins" | "auswahl";
  rollen?: string[];
  antworten: { person: string; antwort: "zusage" | "vielleicht" | "absage"; kommentar?: string }[];
};

const VEREINSTERMINE: DemoVereinstermin[] = [
  {
    art: "sitzung",
    titel: "Trainersitzung",
    tage: 6,
    stunde: 19,
    dauerMinuten: 90,
    ort: "Vereinsheim",
    beschreibung: "Hallenzeiten nach den Ferien, Trainingslager, Jugendspielrunde.",
    sichtbarkeit: "auswahl",
    rollen: ["trainer"],
    antworten: [
      { person: "michael", antwort: "zusage" },
      { person: "sabine", antwort: "vielleicht", kommentar: "komme etwas später" },
    ],
  },
  {
    art: "arbeitseinsatz",
    titel: "Arbeitseinsatz Hallenvorplatz",
    tage: 12,
    stunde: 10,
    dauerMinuten: 180,
    ort: "Sporthalle Musterstadt",
    beschreibung: "Laub und Unkraut entfernen, danach Würstchen vom Grill.",
    sichtbarkeit: "alle",
    antworten: [
      { person: "nina", antwort: "zusage" },
      { person: "tim", antwort: "zusage" },
      { person: "paul", antwort: "absage", kommentar: "im Urlaub" },
    ],
  },
];

export type DemoDaten = {
  vereinName: string;
  mannschaften: typeof MANNSCHAFTEN;
  personen: DemoPerson[];
  termine: DemoTermin[];
  zuordnungen: DemoZuordnung[];
  trainingsplan: { mannschaft: string; wochentag: number; vonMinuten: number; bisMinuten: number; abteil?: number; farbe: string }[];
  // Ausfälle: Position im Trainingsplan oben; das Datum ist das nächste künftige Training an dessen Wochentag (relativ zu "jetzt").
  trainingsausfaelle: { trainingIndex: number; grund: string }[];
  vereinstermine: DemoVereinstermin[];
  eigeneDienste: DemoEigenerDienst[];
  eigeneEinteilungen: DemoEigeneEinteilung[];
};

export function baueDemoDaten(): DemoDaten {
  return {
    vereinName: "HSG Musterstadt (Demo)",
    mannschaften: MANNSCHAFTEN,
    personen: PERSONEN,
    termine: TERMINE,
    zuordnungen: ZUORDNUNGEN,
    eigeneDienste: EIGENE_DIENSTE,
    eigeneEinteilungen: EIGENE_EINTEILUNGEN,
    vereinstermine: VEREINSTERMINE,
    trainingsplan: [
      { mannschaft: "1. Herren", wochentag: 0, vonMinuten: 18 * 60 + 30, bisMinuten: 20 * 60, abteil: 1, farbe: "#3b82f6" },
      { mannschaft: "weibliche C-Jugend", wochentag: 0, vonMinuten: 17 * 60, bisMinuten: 18 * 60 + 15, abteil: 2, farbe: "#f59e0b" },
      { mannschaft: "männliche B-Jugend", wochentag: 1, vonMinuten: 17 * 60, bisMinuten: 18 * 60 + 30, abteil: 1, farbe: "#22c55e" },
      { mannschaft: "weibliche B-Jugend", wochentag: 1, vonMinuten: 18 * 60 + 30, bisMinuten: 20 * 60, abteil: 2, farbe: "#a855f7" },
      { mannschaft: "1. Damen", wochentag: 2, vonMinuten: 19 * 60, bisMinuten: 20 * 60 + 30, abteil: 1, farbe: "#ec4899" },
      { mannschaft: "2. Herren", wochentag: 2, vonMinuten: 17 * 60 + 30, bisMinuten: 19 * 60, abteil: 2, farbe: "#0ea5e9" },
      { mannschaft: "männliche A-Jugend", wochentag: 3, vonMinuten: 18 * 60, bisMinuten: 19 * 60 + 30, abteil: 1, farbe: "#14b8a6" },
      { mannschaft: "1. Herren", wochentag: 4, vonMinuten: 18 * 60, bisMinuten: 19 * 60 + 30, abteil: 1, farbe: "#3b82f6" },
      { mannschaft: "männliche D-Jugend", wochentag: 5, vonMinuten: 15 * 60, bisMinuten: 16 * 60, abteil: 1, farbe: "#84cc16" },
    ],
    // 2. Herren (Mittwoch): Trainer krank, die Halle ist frei
    trainingsausfaelle: [{ trainingIndex: 5, grund: "Trainer krank" }],
  };
}

export function demoEmail(key: string): string {
  return key === DEMO_ADMIN.key ? `admin@${DEMO_EMAIL_DOMAIN}` : `${key}@${DEMO_EMAIL_DOMAIN}`;
}
