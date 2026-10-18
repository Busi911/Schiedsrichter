// Auswahl der Mitglieder nach Suche und Filtern (Liste und Excel-Export nutzen dieselbe Regel) und Aufbereitung für den Export. Rein.
import { filtereMitglieder, STATI, istStatus } from "@/lib/mitglieder";
import { MANNSCHAFT_ROLLEN } from "@/lib/mitglied-mannschaften";
import { datumDeutsch, geschlechtLabel, type ExportZeile } from "@/lib/mitglieder-import";

export type AuswahlMitglied = {
  id: string;
  name: string;
  vorname: string;
  email: string | null;
  status: string;
  artId: string | null;
  geburtsdatum: string | null;
  geschlecht: string | null;
  telefon: string | null;
  eintrittsdatum: string | null;
  austrittsdatum: string | null;
  bemerkung: string | null;
};
export type AuswahlZuordnung = { mitgliedId: string; mannschaftId: string; saison: string; rolle: keyof typeof MANNSCHAFT_ROLLEN };

export type AuswahlFilter = { q: string; status: string; art: string; mannschaft: string; saison: string };

/** Suche + Status + Art ("ohne" = keine Art) + Mannschaft in der Saison ("ohne" = keine Mannschaft in dieser Saison). */
export function waehleMitglieder<T extends AuswahlMitglied>(alle: T[], zuordnungen: AuswahlZuordnung[], f: AuswahlFilter): T[] {
  const inSaison = zuordnungen.filter((z) => z.saison === f.saison);
  const mitMannschaft = new Set(inSaison.map((z) => z.mitgliedId));
  const inGewaehlter = f.mannschaft && f.mannschaft !== "ohne" ? new Set(inSaison.filter((z) => z.mannschaftId === f.mannschaft).map((z) => z.mitgliedId)) : null;
  return filtereMitglieder(alle, f.q, f.status)
    .filter((m) => (f.mannschaft === "ohne" ? !mitMannschaft.has(m.id) : !inGewaehlter || inGewaehlter.has(m.id)))
    .filter((m) => (f.art === "ohne" ? !m.artId : f.art ? m.artId === f.art : true));
}

export function baueExportZeilen(
  mitglieder: AuswahlMitglied[],
  arten: { id: string; name: string }[],
  zuordnungen: AuswahlZuordnung[],
  mannschaften: { id: string; name: string }[],
  saison: string
): ExportZeile[] {
  const artName = new Map(arten.map((a) => [a.id, a.name]));
  const teamName = new Map(mannschaften.map((m) => [m.id, m.name]));
  return mitglieder.map((m) => ({
    vorname: m.vorname,
    name: m.name,
    geburtsdatum: datumDeutsch(m.geburtsdatum),
    geschlecht: geschlechtLabel(m.geschlecht),
    email: m.email ?? "",
    telefon: m.telefon ?? "",
    status: istStatus(m.status) ? STATI[m.status] : m.status,
    art: (m.artId && artName.get(m.artId)) || "",
    eintritt: datumDeutsch(m.eintrittsdatum),
    austritt: datumDeutsch(m.austrittsdatum),
    bemerkung: m.bemerkung ?? "",
    mannschaften: zuordnungen
      .filter((z) => z.mitgliedId === m.id && z.saison === saison)
      .map((z) => `${teamName.get(z.mannschaftId) ?? "Mannschaft"} (${MANNSCHAFT_ROLLEN[z.rolle]})`)
      .join("; "),
  }));
}
