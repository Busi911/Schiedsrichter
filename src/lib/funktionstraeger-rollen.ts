// Zeitnehmer und Sekretär sind im Alltag EINE Funktion mit zwei Aufgaben (dieselbe Verbandslizenz, in der Besetzung gemeinsam gezählt, siehe
// berechneBesetzung). In der Oberfläche gibt es deshalb nur "Zeitnehmer/Sekretär"; in der Datenbank bleiben es die beiden Rollen-Zeilen
// "zeitnehmer" und "sekretaer" (so funktionieren Zuordnung, Selbsteintragung und Auswertungen unverändert). Reine Hilfen ohne DB-Zugriff.

export const ZEITNEHMER_SEKRETAER_TYP = "zeitnehmer_sekretaer";
export const ZEITNEHMER_SEKRETAER_LABEL = "Zeitnehmer/Sekretär";
const PAAR = ["zeitnehmer", "sekretaer"] as const;

// Formularwerte -> echte Rollen: die Sammelrolle wird zu BEIDEN, und auch ein einzelnes "zeitnehmer"/"sekretaer" (alter Import, alte Formulare)
// bringt die zweite Aufgabe mit. Reihenfolge der Eingabe bleibt erhalten, keine Dubletten.
export function expandiereRollenTypen(typen: readonly string[]): string[] {
  const ergebnis: string[] = [];
  const hinzu = (t: string) => {
    if (!ergebnis.includes(t)) ergebnis.push(t);
  };
  for (const t of typen) {
    if (t === ZEITNEHMER_SEKRETAER_TYP || (PAAR as readonly string[]).includes(t)) PAAR.forEach(hinzu);
    else hinzu(t);
  }
  return ergebnis;
}

// Mehrere neue Rollen für die Info-Mail: "Zeitnehmer" + "Sekretär" zusammen werden zu EINER Bezeichnung.
export function kombiniereRollenLabels(labels: string[]): string[] {
  if (!labels.includes("Zeitnehmer") || !labels.includes("Sekretär")) return labels;
  const erster = Math.min(labels.indexOf("Zeitnehmer"), labels.indexOf("Sekretär"));
  return labels.flatMap((l, i) => (l === "Zeitnehmer" || l === "Sekretär" ? (i === erster ? [ZEITNEHMER_SEKRETAER_LABEL] : []) : [l]));
}

type RolleEingabe = { rolleId: string; typ: string; aktiv: boolean; mannschaftName?: string | null };
export type RolleAnzeige<R extends RolleEingabe> = { schluessel: string; label: string; aktiv: boolean; rollen: R[] };

// Für die Anzeige: Zeitnehmer + Sekretär mit gleichem Aktiv-Status werden EINE Zeile ("Zeitnehmer/Sekretär", rollen = beide Zeilen für
// Aktionen wie Deaktivieren). Hat jemand nur eine der beiden, bleibt diese einzeln stehen.
export function fasseRollenZusammen<R extends RolleEingabe>(rollen: R[], typLabel: Record<string, string>): RolleAnzeige<R>[] {
  const eintraege: RolleAnzeige<R>[] = [];
  const verbraucht = new Set<string>();
  for (const r of rollen) {
    if (verbraucht.has(r.rolleId)) continue;
    const partnerTyp = r.typ === "zeitnehmer" ? "sekretaer" : r.typ === "sekretaer" ? "zeitnehmer" : null;
    const partner = partnerTyp ? rollen.find((x) => x.typ === partnerTyp && x.aktiv === r.aktiv && !verbraucht.has(x.rolleId)) : undefined;
    if (partner) {
      verbraucht.add(r.rolleId).add(partner.rolleId);
      eintraege.push({ schluessel: r.rolleId, label: ZEITNEHMER_SEKRETAER_LABEL, aktiv: r.aktiv, rollen: [r, partner] });
    } else {
      verbraucht.add(r.rolleId);
      eintraege.push({
        schluessel: r.rolleId,
        label: `${typLabel[r.typ] ?? r.typ}${r.mannschaftName ? ` (${r.mannschaftName})` : ""}`,
        aktiv: r.aktiv,
        rollen: [r],
      });
    }
  }
  return eintraege;
}

// Auswahlliste für "Rolle anlegen/hinzufügen": Zeitnehmer und Sekretär erscheinen als EIN Eintrag an der Stelle des ersten.
export function rollenZurAuswahl(typLabel: Record<string, string>): [string, string][] {
  const liste: [string, string][] = [];
  for (const [typ, label] of Object.entries(typLabel)) {
    if (typ === "zeitnehmer") liste.push([ZEITNEHMER_SEKRETAER_TYP, ZEITNEHMER_SEKRETAER_LABEL]);
    else if (typ !== "sekretaer") liste.push([typ, label]);
  }
  return liste;
}

type LizenzRolleEingabe = { rolleId: string; userId: string; typ: string; gueltigBis: Date | null; stufeBisher: string | null };

// Lizenz-Erinnerungen: Zeitnehmer + Sekretär derselben Person mit demselben Ablaufdatum sind EINE Erinnerung ("Zeitnehmer/Sekretär", rolleIds = beide,
// damit die erreichte Stufe für beide gemerkt wird). Als bisherige Stufe zählt die NIEDRIGERE der beiden (fehlt eine, wird erinnert).
export function gruppiereLizenzRollen<R extends LizenzRolleEingabe>(
  rollen: R[],
  typLabel: Record<string, string>,
  stufenRang: Record<string, number>
): (R & { rolleIds: string[]; label: string })[] {
  type Einheit = R & { rolleIds: string[]; label: string };
  const einheiten: Einheit[] = [];
  const paare = new Map<string, Einheit>();
  for (const r of rollen) {
    const istPaar = r.typ === "zeitnehmer" || r.typ === "sekretaer";
    const schluessel = istPaar && r.gueltigBis ? `${r.userId}|${r.gueltigBis.toISOString()}` : null;
    const vorhanden = schluessel ? paare.get(schluessel) : undefined;
    if (vorhanden) {
      vorhanden.rolleIds.push(r.rolleId);
      vorhanden.label = ZEITNEHMER_SEKRETAER_LABEL;
      const rang = (st: string | null) => (st ? (stufenRang[st] ?? 0) : 0);
      if (rang(r.stufeBisher) < rang(vorhanden.stufeBisher)) vorhanden.stufeBisher = r.stufeBisher;
      continue;
    }
    const einheit: Einheit = { ...r, rolleIds: [r.rolleId], label: typLabel[r.typ] ?? r.typ };
    einheiten.push(einheit);
    if (schluessel) paare.set(schluessel, einheit);
  }
  return einheiten;
}
