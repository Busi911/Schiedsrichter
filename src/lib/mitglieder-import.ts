// Excel-Import und -Export der Mitglieder (Vereinsverwaltung): Spalten, Datums-/Geschlechts-Umwandlung, Plan mit Duplikatprüfung. Rein, ohne Datenbank und ohne Excel-Bibliothek.
import { GESCHLECHTER, STATI, pruefeMitglied, type GeprueftesMitglied } from "@/lib/mitglieder";
import { findeMitglied, type MitgliedKurz } from "@/lib/mitglieder-ueberfuehrung";
import { pruefeArtName } from "@/lib/mitgliedsarten";

export const FELDER = ["vorname", "name", "geburtsdatum", "geschlecht", "email", "telefon", "status", "art", "eintritt", "austritt", "bemerkung"] as const;
export type FeldName = (typeof FELDER)[number];

/** Spaltenüberschriften der Vorlage und des Exports (in dieser Reihenfolge); beim Export kommt "Mannschaften" dazu, das der Import ignoriert. */
export const KOPF_TITEL: Record<FeldName, string> = {
  vorname: "Vorname",
  name: "Nachname",
  geburtsdatum: "Geburtsdatum",
  geschlecht: "Geschlecht",
  email: "E-Mail",
  telefon: "Telefon",
  status: "Status",
  art: "Art der Mitgliedschaft",
  eintritt: "Eintritt",
  austritt: "Austritt",
  bemerkung: "Bemerkung",
};

const ALIASE: Record<string, FeldName> = {
  vorname: "vorname",
  nachname: "name",
  name: "name",
  familienname: "name",
  geburtsdatum: "geburtsdatum",
  geboren: "geburtsdatum",
  geschlecht: "geschlecht",
  "e-mail": "email",
  email: "email",
  mail: "email",
  telefon: "telefon",
  tel: "telefon",
  handy: "telefon",
  status: "status",
  art: "art",
  "art der mitgliedschaft": "art",
  mitgliedsart: "art",
  eintritt: "eintritt",
  eintrittsdatum: "eintritt",
  austritt: "austritt",
  austrittsdatum: "austritt",
  bemerkung: "bemerkung",
  notiz: "bemerkung",
};

export function feldFuerKopf(kopf: string): FeldName | null {
  return ALIASE[kopf.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

export const MAX_ZEILEN = 2000;

/** "TT.MM.JJJJ" oder "JJJJ-MM-TT" (auch ein Excel-Datum als Date) -> "JJJJ-MM-TT"; leer -> ""; sonst Fehler. */
export function datumText(wert: unknown): { wert: string } | { fehler: string } {
  if (wert instanceof Date) {
    return Number.isNaN(wert.getTime()) ? { fehler: "Datum unlesbar." } : { wert: wert.toISOString().slice(0, 10) };
  }
  const text = String(wert ?? "").trim();
  if (!text) return { wert: "" };
  const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (deutsch) return { wert: `${deutsch[3]}-${deutsch[2].padStart(2, "0")}-${deutsch[1].padStart(2, "0")}` };
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(text);
  if (iso) return { wert: iso[1] };
  return { fehler: `Datum „${text}“ unlesbar (erwartet TT.MM.JJJJ).` };
}

export function geschlechtText(wert: unknown): { wert: string } | { fehler: string } {
  const t = String(wert ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!t) return { wert: "" };
  if (["m", "männlich", "maennlich", "männl", "maennl", "mann"].includes(t)) return { wert: "m" };
  if (["w", "weiblich", "weibl", "frau"].includes(t)) return { wert: "w" };
  if (["d", "x", "divers"].includes(t)) return { wert: "divers" };
  return { fehler: `Geschlecht „${t}“ unbekannt (m, w oder divers).` };
}

export function statusText(wert: unknown): { wert: string } | { fehler: string } {
  const t = String(wert ?? "").trim().toLowerCase();
  if (!t) return { wert: "aktiv" };
  const treffer = Object.entries(STATI).find(([schluessel, label]) => schluessel === t || label.toLowerCase() === t);
  return treffer ? { wert: treffer[0] } : { fehler: `Status „${t}“ unbekannt (Aktiv, Passiv oder Ausgetreten).` };
}

export type RohZeile = { zeilenNr: number; felder: Partial<Record<FeldName, unknown>> };
export type ImportNeu = { zeilenNr: number; wert: GeprueftesMitglied; artName: string | null };
export type ImportPlan = {
  neu: ImportNeu[];
  uebersprungen: { zeilenNr: number; grund: string }[];
  fehler: { zeilenNr: number; grund: string }[];
  neueArten: string[];
};

const text = (w: unknown) => (w instanceof Date ? "" : String(w ?? "")).trim();

/**
 * Plan für einen Import: gültige neue Mitglieder, übersprungene Doppelte (schon in der Liste oder mehrfach in der Datei) und Fehler je Zeile.
 * Eine unbekannte Art wird als neue Art vorgemerkt. Der Plan schreibt nichts.
 */
export function planeImport(zeilen: RohZeile[], kontext: { vorhandene: MitgliedKurz[]; arten: { name: string }[]; heute: string }): ImportPlan {
  const plan: ImportPlan = { neu: [], uebersprungen: [], fehler: [], neueArten: [] };
  if (zeilen.length > MAX_ZEILEN) {
    plan.fehler.push({ zeilenNr: 0, grund: `Zu viele Zeilen (höchstens ${MAX_ZEILEN} je Import).` });
    return plan;
  }
  const pool: MitgliedKurz[] = kontext.vorhandene.map((m) => ({ ...m }));
  const artSchluessel = new Map(kontext.arten.map((a) => [a.name.toLowerCase(), a.name]));
  const neueArtSchluessel = new Map<string, string>();

  for (const z of zeilen) {
    const f = z.felder;
    const geburt = datumText(f.geburtsdatum);
    const eintritt = datumText(f.eintritt);
    const austritt = datumText(f.austritt);
    const geschlecht = geschlechtText(f.geschlecht);
    const status = statusText(f.status);
    const fehlerHier = [geburt, eintritt, austritt, geschlecht, status].find((e) => "fehler" in e);
    if (fehlerHier && "fehler" in fehlerHier) {
      plan.fehler.push({ zeilenNr: z.zeilenNr, grund: fehlerHier.fehler });
      continue;
    }
    const geprueft = pruefeMitglied(
      {
        name: text(f.name),
        vorname: text(f.vorname),
        geburtsdatum: "wert" in geburt ? geburt.wert : "",
        email: text(f.email),
        telefon: text(f.telefon),
        geschlecht: "wert" in geschlecht ? geschlecht.wert : "",
        status: "wert" in status ? status.wert : "aktiv",
        eintrittsdatum: "wert" in eintritt ? eintritt.wert : "",
        austrittsdatum: "wert" in austritt ? austritt.wert : "",
        bemerkung: text(f.bemerkung),
      },
      kontext.heute
    );
    if ("fehler" in geprueft) {
      plan.fehler.push({ zeilenNr: z.zeilenNr, grund: geprueft.fehler });
      continue;
    }
    const w = geprueft.wert;

    let artName: string | null = null;
    const artRoh = text(f.art);
    if (artRoh) {
      const gepruefte = pruefeArtName(artRoh);
      if ("fehler" in gepruefte) {
        plan.fehler.push({ zeilenNr: z.zeilenNr, grund: gepruefte.fehler });
        continue;
      }
      const schluessel = gepruefte.name.toLowerCase();
      artName = artSchluessel.get(schluessel) ?? neueArtSchluessel.get(schluessel) ?? gepruefte.name;
      if (!artSchluessel.has(schluessel) && !neueArtSchluessel.has(schluessel)) neueArtSchluessel.set(schluessel, gepruefte.name);
    }

    const treffer = findeMitglied({ vorname: w.vorname, name: w.name, email: w.email, geburtsdatum: w.geburtsdatum }, pool);
    if (treffer) {
      plan.uebersprungen.push({
        zeilenNr: z.zeilenNr,
        grund: `${w.name}, ${w.vorname} gibt es schon als „${treffer.mitglied.name}, ${treffer.mitglied.vorname}“${treffer.art === "pruefen" ? " (bitte prüfen)" : ""}.`,
      });
      continue;
    }
    plan.neu.push({ zeilenNr: z.zeilenNr, wert: w, artName });
    pool.push({ id: `import:${z.zeilenNr}`, name: w.name, vorname: w.vorname, email: w.email, userId: null, geburtsdatum: w.geburtsdatum });
  }
  plan.neueArten = [...neueArtSchluessel.values()];
  return plan;
}

// --- Export ---------------------------------------------------------------

export type ExportZeile = {
  vorname: string;
  name: string;
  geburtsdatum: string;
  geschlecht: string;
  email: string;
  telefon: string;
  status: string;
  art: string;
  eintritt: string;
  austritt: string;
  bemerkung: string;
  mannschaften: string;
};

/** "JJJJ-MM-TT" -> "TT.MM.JJJJ" (so liest es der Import wieder ein). */
export function datumDeutsch(d: string | null): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

export function geschlechtLabel(g: string | null): string {
  return g && g in GESCHLECHTER ? GESCHLECHTER[g as keyof typeof GESCHLECHTER] : "";
}

/** Zellen, die in Excel als Formel gelesen würden (Beginn mit = + - @), bekommen ein Hochkomma davor (CSV-/Formel-Injection). */
export function zelleSicher(wert: string): string {
  return /^[=+\-@\t\r]/.test(wert) ? `'${wert}` : wert;
}
