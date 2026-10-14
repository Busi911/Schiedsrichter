// Vom Verein selbst definierte Dienste (z.B. Fahrer, Kuchen, Aufbau), zusätzlich zu den festen Diensten aus lib/dienste.ts.
// Rein (ohne DB), getestet in eigene-dienste.test.ts; Laden in eigene-dienste-daten.ts.
//
// Ein eigener Dienst gilt für einen Termin, wenn
//   - er aktiv ist,
//   - die Veranstaltungsart passt (Heimspiel, Auswärtsspiel, Freundschaftsspiel, Turnier; siehe veranstaltungsArt), und
//   - bei "nur ausgewählte Mannschaften" die Mannschaft des Termins ausgewählt ist.
// Der Bedarf ist dann der Standard-Bedarf des Dienstes, außer für den Termin ist ein eigener Wert gesetzt (termin_dienst_bedarf, auch 0) —
// der geht immer vor, auch wenn der Dienst sonst nicht gälte (bewusste Einzelentscheidung des Warts).

export type DienstArtRegel = {
  id: string;
  name: string;
  aktiv: boolean;
  fuerHeimspiele: boolean;
  fuerAuswaertsspiele: boolean;
  fuerFreundschaftsspiele: boolean;
  fuerTurniere: boolean;
  standardBedarf: number;
  nurAusgewaehlteMannschaften: boolean;
  // Nur ausgewertet, wenn nurAusgewaehlteMannschaften gesetzt ist.
  mannschaftIds: string[];
};

export type TerminFuerDienste = {
  id: string;
  typ: string;
  pflichtspiel?: boolean | null;
  freundschaftsTyp?: "freundschaftsspiel" | "turnier" | null;
  mannschaftId?: string | null;
  // Auswärtsspiel (nur aus den Liga-Daten angelegt, wenn ein Dienst "gilt für Auswärtsspiele" greift).
  auswaerts?: boolean | null;
};

export type Veranstaltungsart = "heimspiel" | "auswaertsspiel" | "freundschaftsspiel" | "turnier";

// Welche Veranstaltung ein Termin für die eigenen Dienste ist. Wie bei den festen Diensten (bedarfFuer in dienste.ts):
// - Rundenspiele ohne Pflichtspiel sind Freundschaftsspiele bzw. Turniere (freundschaftsTyp),
// - beim Turnier gilt der Dienst für den Turnier-Termin selbst, nicht für jedes Einzelspiel (turnier_spiel),
// - persönliche Schiedsrichter-Einsätze (spiel_ics) haben nie eigene Dienste.
export function veranstaltungsArt(t: TerminFuerDienste): Veranstaltungsart | null {
  if (t.typ === "rundenspiel") {
    if (t.pflichtspiel === false) return t.freundschaftsTyp === "turnier" ? "turnier" : "freundschaftsspiel";
    return t.auswaerts ? "auswaertsspiel" : "heimspiel";
  }
  if (t.typ === "testspiel") return "freundschaftsspiel";
  if (t.typ === "turnier") return "turnier";
  return null;
}

export function dienstGiltFuerTermin(d: DienstArtRegel, t: TerminFuerDienste): boolean {
  if (!d.aktiv) return false;
  const art = veranstaltungsArt(t);
  const passt =
    (art === "heimspiel" && d.fuerHeimspiele) ||
    (art === "auswaertsspiel" && d.fuerAuswaertsspiele) ||
    (art === "freundschaftsspiel" && d.fuerFreundschaftsspiele) ||
    (art === "turnier" && d.fuerTurniere);
  if (!passt) return false;
  if (d.nurAusgewaehlteMannschaften) return !!t.mannschaftId && d.mannschaftIds.includes(t.mannschaftId);
  return true;
}

// override = für genau diesen Termin gesetzter Bedarf (termin_dienst_bedarf), null/undefined = keiner.
export function bedarfEigenerDienst(d: DienstArtRegel, t: TerminFuerDienste, override?: number | null): number {
  if (!d.aktiv) return 0;
  if (override != null) return Math.max(0, override);
  return dienstGiltFuerTermin(d, t) ? Math.max(0, d.standardBedarf) : 0;
}

// Schlüssel für die Termin-Overrides (Map aus termin_dienst_bedarf).
export function bedarfSchluessel(terminId: string, dienstArtId: string): string {
  return `${terminId}|${dienstArtId}`;
}

export type EigeneDiensteKontext = {
  arten: DienstArtRegel[];
  // bedarfSchluessel(terminId, dienstArtId) -> Bedarf
  overrides: Map<string, number>;
};

export const LEERER_KONTEXT: EigeneDiensteKontext = { arten: [], overrides: new Map() };

export type EigeneDienstStelle = { dienstArtId: string; name: string; bedarf: number; vorhanden: number };

// Alle eigenen Dienste mit Bedarf > 0 für einen Termin, mit der Zahl der Einteilungen (in der Reihenfolge der Arten).
export function eigeneDiensteFuerTermin(
  kontext: EigeneDiensteKontext,
  t: TerminFuerDienste,
  zuordnungen: { terminId: string; funktionstraegerTyp: string; dienstArtId?: string | null }[]
): EigeneDienstStelle[] {
  const stellen: EigeneDienstStelle[] = [];
  for (const d of kontext.arten) {
    const bedarf = bedarfEigenerDienst(d, t, kontext.overrides.get(bedarfSchluessel(t.id, d.id)));
    if (bedarf <= 0) continue;
    const vorhanden = zuordnungen.filter(
      (z) => z.terminId === t.id && z.funktionstraegerTyp === "eigener_dienst" && z.dienstArtId === d.id
    ).length;
    stellen.push({ dienstArtId: d.id, name: d.name, bedarf, vorhanden });
  }
  return stellen;
}

// Nur die noch nicht voll besetzten Dienste (für "Offene Dienste" und die Besetzungs-Ampel).
export function eigeneDiensteLuecken(
  kontext: EigeneDiensteKontext,
  t: TerminFuerDienste,
  zuordnungen: { terminId: string; funktionstraegerTyp: string; dienstArtId?: string | null }[]
): EigeneDienstStelle[] {
  return eigeneDiensteFuerTermin(kontext, t, zuordnungen).filter((s) => s.vorhanden < s.bedarf);
}

// Formular: Name prüfen und bereinigen (keine leeren, keine überlangen, keine Doppelten im Verein, Groß-/Kleinschreibung egal).
export function pruefeDienstName(name: string, vorhandeneNamen: string[]): string {
  const sauber = name.replace(/\s+/g, " ").trim();
  if (!sauber) throw new Error("Bitte einen Namen für den Dienst angeben.");
  if (sauber.length > 40) throw new Error("Der Name darf höchstens 40 Zeichen lang sein.");
  if (vorhandeneNamen.some((n) => n.trim().toLowerCase() === sauber.toLowerCase())) {
    throw new Error(`Einen Dienst „${sauber}“ gibt es schon.`);
  }
  return sauber;
}

export const MAX_BEDARF = 20;

export function pruefeBedarf(roh: unknown): number {
  const zahl = typeof roh === "string" ? Number(roh.trim()) : Number(roh);
  if (!Number.isInteger(zahl) || zahl < 0 || zahl > MAX_BEDARF) {
    throw new Error(`Der Bedarf muss eine ganze Zahl von 0 bis ${MAX_BEDARF} sein.`);
  }
  return zahl;
}

// Kurzbeschreibung für die Einstellungen ("Heimspiele, Turniere · 2 je Termin · nur mJA, mJB").
export function geltungsText(d: DienstArtRegel, mannschaftsNamen: Map<string, string>): string {
  const arten = [
    d.fuerHeimspiele && "Heimspiele",
    d.fuerAuswaertsspiele && "Auswärtsspiele",
    d.fuerFreundschaftsspiele && "Freundschaftsspiele",
    d.fuerTurniere && "Turniere",
  ].filter(Boolean) as string[];
  const teile = [arten.length ? arten.join(", ") : "keine Veranstaltung gewählt", `${d.standardBedarf} je Termin`];
  if (d.nurAusgewaehlteMannschaften) {
    const namen = d.mannschaftIds.map((id) => mannschaftsNamen.get(id)).filter(Boolean) as string[];
    teile.push(namen.length ? `nur ${namen.join(", ")}` : "keine Mannschaft gewählt");
  }
  return teile.join(" · ");
}

export type EingeteiltePerson = {
  zuordnungId: string;
  terminId: string;
  dienstArtId: string | null;
  userId: string | null;
  anzeigeName: string;
  ohneLogin: boolean;
};

export type DienstwartStelle = {
  dienstArtId: string;
  name: string;
  bedarf: number;
  // Für genau diesen Termin gesetzter Bedarf (null = Standard des Dienstes).
  override: number | null;
  eingeteilt: EingeteiltePerson[];
};

// Für /profil/dienstwart: je Termin alle eigenen Dienste, die dort gelten, einen eigenen Bedarf haben oder schon Einteilungen
// (auch deaktivierte Dienste mit Einteilungen, damit niemand unsichtbar eingeteilt bleibt). Termine ohne all das fallen weg.
export function dienstwartStellen(
  kontext: EigeneDiensteKontext,
  // Alle Dienste des Vereins (auch deaktivierte), für die Namen bestehender Einteilungen.
  alleArten: { id: string; name: string; aktiv: boolean }[],
  t: TerminFuerDienste,
  eingeteilt: EingeteiltePerson[]
): DienstwartStelle[] {
  const stellen: DienstwartStelle[] = [];
  for (const art of alleArten) {
    const regel = kontext.arten.find((a) => a.id === art.id);
    const override = kontext.overrides.get(bedarfSchluessel(t.id, art.id)) ?? null;
    const bedarf = regel ? bedarfEigenerDienst(regel, t, override) : 0;
    const personen = eingeteilt.filter((e) => e.terminId === t.id && e.dienstArtId === art.id);
    // Ein auf 0 gesetzter Bedarf eines aktiven Dienstes bleibt sichtbar, damit er sich wieder ändern lässt.
    if (bedarf <= 0 && personen.length === 0 && !(regel && override != null)) continue;
    stellen.push({ dienstArtId: art.id, name: art.name, bedarf, override, eingeteilt: personen });
  }
  return stellen;
}

// Rollenbezeichnung einer Einteilung für Listen (Profil, Kalender-Feed): bei eigenen Diensten deren Name, sonst der Typ (den der
// Aufrufer wie bisher über seine Label-Tabelle übersetzt).
export function rolleFuerAnzeige(
  z: { funktionstraegerTyp: string; dienstArtId?: string | null },
  dienstNamen: Map<string, string>
): string {
  if (z.funktionstraegerTyp !== "eigener_dienst") return z.funktionstraegerTyp;
  return (z.dienstArtId && dienstNamen.get(z.dienstArtId)) || "Helfer";
}
