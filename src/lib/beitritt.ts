// Online-Beitritt (öffentliches Formular /verein/[slug]/beitritt, Add-on Vereinsverwaltung): Prüfung der Eingaben. Rein, ohne Datenbank.
import { istEchtesDatum, heuteBerlin, istGeschlecht, type Geschlecht } from "@/lib/mitglieder";

/** Höchstens so viele neue Anträge je Verein und Stunde (Schutz vor Missbrauch des öffentlichen Formulars, ohne externen Dienst). */
export const MAX_ANTRAEGE_PRO_STUNDE = 20;
export const MAX_ALTER_JAHRE = 110;

export type BeitrittEingabe = {
  vorname: string;
  name: string;
  geburtsdatum: string;
  email: string;
  telefon: string;
  geschlecht: string;
  mannschaftId: string;
  datenschutz: boolean;
  satzung: boolean;
  fotos: boolean;
};

export type GepruefterAntrag = {
  vorname: string;
  name: string;
  geburtsdatum: string;
  email: string;
  telefon: string | null;
  geschlecht: Geschlecht | null;
  mannschaftId: string | null;
  einwilligungen: { datenschutz: boolean; fotos: boolean; vereinigung: boolean };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Alter in vollen Jahren am Stichtag ("JJJJ-MM-TT"). */
export function alterAm(geburtsdatum: string, heute: string = heuteBerlin()): number {
  const [gj, gm, gt] = geburtsdatum.split("-").map(Number);
  const [hj, hm, ht] = heute.split("-").map(Number);
  return hj - gj - (hm < gm || (hm === gm && ht < gt) ? 1 : 0);
}

export const istMinderjaehrig = (geburtsdatum: string, heute?: string) => alterAm(geburtsdatum, heute) < 18;

/** `satzungErforderlich`: nur wenn der Verein einen Satzungslink hinterlegt hat, gibt es die Pflicht-Einwilligung "Satzung gelesen". */
export function pruefeBeitrittAntrag(e: BeitrittEingabe, opt: { satzungErforderlich: boolean; heute?: string }): { wert: GepruefterAntrag } | { fehler: string } {
  const heute = opt.heute ?? heuteBerlin();
  const vorname = e.vorname.trim().replace(/\s+/g, " ");
  const name = e.name.trim().replace(/\s+/g, " ");
  if (!vorname || !name) return { fehler: "Bitte Vor- und Nachname angeben." };
  if (vorname.length > 100 || name.length > 100) return { fehler: "Der Name ist zu lang (höchstens 100 Zeichen)." };

  const geburtsdatum = e.geburtsdatum.trim();
  if (!geburtsdatum) return { fehler: "Bitte das Geburtsdatum angeben." };
  if (!istEchtesDatum(geburtsdatum)) return { fehler: "Das Geburtsdatum ist ungültig." };
  if (geburtsdatum > heute) return { fehler: "Das Geburtsdatum liegt in der Zukunft." };
  if (alterAm(geburtsdatum, heute) > MAX_ALTER_JAHRE) return { fehler: "Das Geburtsdatum ist nicht plausibel." };

  const email = e.email.trim();
  if (!email) return { fehler: "Bitte eine E-Mail-Adresse angeben." };
  if (email.length > 200 || !EMAIL.test(email)) return { fehler: "Die E-Mail-Adresse ist ungültig." };

  const geschlecht = e.geschlecht.trim();
  if (geschlecht && !istGeschlecht(geschlecht)) return { fehler: "Unbekanntes Geschlecht." };
  const mannschaftId = e.mannschaftId.trim();
  if (mannschaftId && !UUID.test(mannschaftId)) return { fehler: "Unbekannte Mannschaft." };

  if (!e.datenschutz) return { fehler: "Bitte bestätige, dass du die Datenschutzerklärung gelesen hast." };
  if (opt.satzungErforderlich && !e.satzung) return { fehler: "Bitte bestätige, dass du die Satzung gelesen hast und ihr zustimmst." };

  return {
    wert: {
      vorname,
      name,
      geburtsdatum,
      email: email.toLowerCase(),
      telefon: e.telefon.trim().slice(0, 50) || null,
      geschlecht: geschlecht ? (geschlecht as Geschlecht) : null,
      mannschaftId: mannschaftId || null,
      einwilligungen: { datenschutz: true, fotos: e.fotos, vereinigung: opt.satzungErforderlich ? e.satzung : false },
    },
  };
}

/** Nur https-Adressen (z.B. Link zur Satzung); leer = kein Link. */
export function pruefeHttpsUrl(roh: string): { url: string | null } | { fehler: string } {
  const t = roh.trim();
  if (!t) return { url: null };
  if (t.length > 500) return { fehler: "Der Link ist zu lang." };
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return { fehler: "Der Link muss mit https:// beginnen." };
    return { url: u.toString() };
  } catch {
    return { fehler: "Der Link ist ungültig." };
  }
}
