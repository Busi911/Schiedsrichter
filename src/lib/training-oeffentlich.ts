// Reine Aufbereitung der Trainings für die ÖFFENTLICHE Vereins-App (ohne DB, getestet in training-oeffentlich.test.ts). Whitelist: nur Mannschaft, Tag, Uhrzeit, Ort und
// "fällt aus" — NIE der Grund eines Ausfalls, Notizen, Buchungen ("belegt von …") oder Personen (Trainer).
import { mannschaftsRang } from "./mannschaft-sortierung";
import { konkreteTrainings, type AusfallZeile, type SaisonPruefung, type TrainingsZeile } from "./training-ausfall";
import { abteilLabel, istInSaison, type HalleMitAbteilen, type Saison } from "./trainingsplan";

export type OeffentlicheGruppe = "herren" | "damen" | "jugend" | "kinder";

export type OeffentlichesTraining = {
  id: string; // trainingszeit-id|datum, nur als React-Schlüssel
  datum: string; // YYYY-MM-DD
  startMinuten: number;
  endMinuten: number;
  mannschaft: string;
  // Verweis auf die öffentliche Liga-Mannschaft (für Favoriten); null, wenn die Mannschaft nicht damit verknüpft ist
  ligaMannschaftId: string | null;
  gruppe: OeffentlicheGruppe;
  ort: string;
  ausgefallen: boolean;
};

type MannschaftIn = { id: string; name: string; altersklasse: string | null; ligaMannschaftId: string | null };
type HalleIn = { id: string; name: string } & HalleMitAbteilen & Saison;

// Filtergruppe: bevorzugt die Kategorie der verknüpften Liga-Mannschaft, sonst aus Name/Altersklasse; Unbekanntes landet bei "jugend".
export function oeffentlicheGruppe(m: { name: string; altersklasse: string | null }, ligaKategorie: string | null | undefined): OeffentlicheGruppe {
  switch (ligaKategorie) {
    case "herren":
      return "herren";
    case "damen":
      return "damen";
    case "jugend_maennlich":
    case "jugend_weiblich":
      return "jugend";
    default:
      break;
  }
  const rang = mannschaftsRang(m);
  if (rang === 0) return "herren";
  if (rang === 1) return "damen";
  if (rang >= 7 && rang < 100) return "kinder";
  return "jugend";
}

export function baueOeffentlicheTrainings(p: {
  zeiten: TrainingsZeile[];
  ausfaelle: AusfallZeile[];
  mannschaften: MannschaftIn[];
  hallen: HalleIn[];
  // liga_mannschaft.id -> Kategorie
  ligaKategorien: Map<string, string>;
  jetzt: Date;
  tage: number;
}): OeffentlichesTraining[] {
  const mannschaft = new Map(p.mannschaften.map((m) => [m.id, m]));
  const halle = new Map(p.hallen.map((h) => [h.id, h]));
  const inSaison: SaisonPruefung = (halleId, datum) => {
    const h = halle.get(halleId);
    return !h || istInSaison(h, datum);
  };
  return konkreteTrainings(p.zeiten, p.ausfaelle, p.jetzt, p.tage, inSaison).flatMap((t) => {
    const m = mannschaft.get(t.mannschaftId);
    if (!m) return [];
    const h = halle.get(t.halleId);
    const ort = h ? (t.abteilNummer ? `${h.name}, ${abteilLabel(h, t.abteilNummer)}` : h.name) : "";
    return [
      {
        id: `${t.id}|${t.datum}`,
        datum: t.datum,
        startMinuten: t.startMinuten,
        endMinuten: t.endMinuten,
        mannschaft: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
        ligaMannschaftId: m.ligaMannschaftId,
        gruppe: oeffentlicheGruppe(m, m.ligaMannschaftId ? p.ligaKategorien.get(m.ligaMannschaftId) : null),
        ort,
        ausgefallen: t.ausgefallen,
      },
    ];
  });
}
