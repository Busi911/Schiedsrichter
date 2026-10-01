import { slugify } from "@/lib/nuliga/normalisierung";

// Reiner (DB-freier) Abgleich: gehört ein bestehender Hallenplan-Termin
// (termine.typ = 'rundenspiel', Import über die Hallen-ID) zu einem Spiel der
// öffentlichen Liga-Daten (liga_spiel)? Basis für die spätere Vereinheitlichung
// der beiden Wege (Schritt 1: nur Bericht, es wird nichts verändert).

export type AbgleichTermin = {
  id: string;
  start: Date;
  icsUid: string | null;
  heim: string | null;
  gast: string | null;
};

export type AbgleichSpiel = {
  id: string;
  spielnummer: number | null;
  datum: string; // YYYY-MM-DD (Berliner Tag)
  heimName: string;
  gastName: string;
};

export type AbgleichStatus = "sicher" | "unklar" | "mehrdeutig" | "kein_treffer";

export type AbgleichErgebnis = {
  terminId: string;
  status: AbgleichStatus;
  spielIds: string[];
};

const ROEMISCH: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
};

// "HSG Dutenhofen/Münchholzhausen II" und "… 2" sollen gleich vergleichen.
export function normalisiereName(name: string | null): string {
  if (!name) return "";
  const teile = slugify(name).split("-").filter(Boolean);
  const letzte = teile[teile.length - 1];
  if (teile.length > 1 && letzte && ROEMISCH[letzte]) teile[teile.length - 1] = ROEMISCH[letzte];
  return teile.join("-");
}

// Spielnummer aus der Termin-UID (siehe bildeUid in rundenspiel-import.ts):
// "rundenspiel:{Halle}:{Heim}:{Gast}:{Nummer}" — die Variante ohne echte
// Nummer trägt stattdessen Datum/Zeit und liefert hier null.
export function spielnummerAusUid(uid: string | null): number | null {
  if (!uid || !uid.startsWith("rundenspiel:")) return null;
  const teile = uid.slice("rundenspiel:".length).split(":");
  if (teile.length < 4 || /^\d{4}-\d{2}-\d{2}$/.test(teile[1] ?? "")) return null;
  const nummer = teile[teile.length - 1];
  return /^\d+$/.test(nummer) && nummer !== "0" ? Number(nummer) : null;
}

const berlinTag = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function gleicheMannschaften(t: AbgleichTermin, s: AbgleichSpiel): boolean {
  return (
    normalisiereName(t.heim) !== "" &&
    normalisiereName(t.heim) === normalisiereName(s.heimName) &&
    normalisiereName(t.gast) === normalisiereName(s.gastName)
  );
}

export function gleicheMannschaftenVertauscht(t: AbgleichTermin, s: AbgleichSpiel): boolean {
  return (
    normalisiereName(t.heim) !== "" &&
    normalisiereName(t.heim) === normalisiereName(s.gastName) &&
    normalisiereName(t.gast) === normalisiereName(s.heimName)
  );
}

// sicher: genau ein Spiel mit gleichen Mannschaften UND (gleiche Spielnummer
// ODER gleicher Tag). mehrdeutig: mehrere solche Spiele. unklar: kein solches,
// aber ein Spiel mit gleicher Spielnummer bzw. gleichen Mannschaften an einem
// anderen Tag (z.B. verlegt) — wird nie automatisch verknüpft.
export function gleicheAb(termine: AbgleichTermin[], spiele: AbgleichSpiel[]): AbgleichErgebnis[] {
  return termine.map((t) => {
    const nummer = spielnummerAusUid(t.icsUid);
    const tag = berlinTag.format(t.start);
    const sicher = spiele.filter(
      (s) =>
        gleicheMannschaften(t, s) &&
        ((nummer !== null && s.spielnummer === nummer) || s.datum === tag)
    );
    if (sicher.length === 1) return { terminId: t.id, status: "sicher", spielIds: [sicher[0].id] };
    if (sicher.length > 1) {
      return { terminId: t.id, status: "mehrdeutig", spielIds: sicher.map((s) => s.id) };
    }
    const vage = spiele.filter(
      (s) =>
        gleicheMannschaften(t, s) ||
        (nummer !== null && s.spielnummer === nummer && gleicheMannschaftenVertauscht(t, s)) ||
        (nummer !== null && s.spielnummer === nummer && s.datum === tag)
    );
    if (vage.length > 0) return { terminId: t.id, status: "unklar", spielIds: vage.map((s) => s.id) };
    return { terminId: t.id, status: "kein_treffer", spielIds: [] };
  });
}
