import { PREIS_BETA, PREIS_REGULAER, PREIS_SPONSOR } from "./beta-konditionen";

// Abrechnung (Live-Gang Ende 11.2026). Reine Logik, ohne Datenbank: Tarif -> Betrag, Zahlungsstatus, Vorschlag für "bezahlt bis".
// Die Rechnung stellt der Systemadmin von Hand (/system/abrechnung); die App rechnet nichts ab und zieht nichts ein.

export type Tarif = "befreit" | "beta" | "regulaer";

export const TARIF_NAMEN: Record<Tarif, string> = { befreit: "Befreit (zahlt nichts)", beta: "Beta-Tester", regulaer: "Regulär" };

// Die Beta endet mit dem 30.11.2026 (Berlin); ab dem 1.12. gilt für neue Vereine der reguläre Preis und die Registrierung ist kostenpflichtig.
export const BETA_ENDE_ZEITPUNKT = new Date("2026-12-01T00:00:00+01:00");
// Erste Zahlungsfrist der Beta-Tester: Rechnung ab 1.12.2026, Zahlungsziel bis zum Jahresende.
export const BETA_ERSTE_FRIST = new Date("2026-12-31T23:59:59+01:00");
export const ZAHLUNGSFRIST_TAGE = 30; // neue Vereine nach dem Beta-Ende: Zeit bis zur ersten Zahlung
export const KARENZ_TAGE = 30; // nach Fälligkeit: erst danach wird gesperrt
export const VORLAUF_TAGE = 30; // so früh vor Ablauf einer Periode wird erinnert

const TAG = 24 * 3600 * 1000;
export const betaVorbei = (jetzt: Date) => jetzt.getTime() >= BETA_ENDE_ZEITPUNKT.getTime();

// Netto-Jahresbetrag, den der Rechnungsempfänger zahlt. Sponsor übernimmt ALLES: Vereinspreis + Werbeplatz.
export function betragNetto(tarif: Tarif, sponsor: boolean): number {
  const verein = tarif === "befreit" ? 0 : tarif === "beta" ? PREIS_BETA : PREIS_REGULAER;
  return verein + (sponsor ? PREIS_SPONSOR : 0);
}

// Tarif und erste Frist für einen NEUEN Verein: vor dem Beta-Ende Beta-Tester (erste Rechnung ab 1.12.), danach regulär mit 30 Tagen Frist.
export function startKonditionen(jetzt: Date): { tarif: Tarif; zahlungFaelligAm: Date | null } {
  return betaVorbei(jetzt) ? { tarif: "regulaer", zahlungFaelligAm: new Date(jetzt.getTime() + ZAHLUNGSFRIST_TAGE * TAG) } : { tarif: "beta", zahlungFaelligAm: null };
}

export type ZahlungsArt =
  | "vorbereitung" // noch kein Vereinsadmin, nichts zu zahlen
  | "befreit"
  | "beta_kostenlos" // Beta läuft, noch nichts fällig
  | "bezahlt"
  | "bald_faellig" // Periode läuft in höchstens VORLAUF_TAGE Tagen ab, oder erste Rechnung innerhalb der Frist
  | "ueberfaellig" // Fälligkeit überschritten, Karenz läuft
  | "gesperrt"; // Fälligkeit + Karenz überschritten (und die Sperre ist nicht ausgesetzt)

export type ZahlungsEingabe = {
  status: "vorbereitung" | "aktiv";
  tarif: Tarif;
  zahlungBis: Date | null;
  zahlungFaelligAm: Date | null;
  zahlungSperreAus: boolean;
};

export type ZahlungsStand = { art: ZahlungsArt; faelligAm: Date | null; sperreAb: Date | null; tageBisFaellig: number | null };

// Fällig ist, was zuerst kommt: das Ende der bezahlten Periode, sonst die gesetzte erste Frist, sonst für Beta-Tester die erste Beta-Frist.
export function zahlungsStand(v: ZahlungsEingabe, jetzt: Date): ZahlungsStand {
  const leer = (art: ZahlungsArt): ZahlungsStand => ({ art, faelligAm: null, sperreAb: null, tageBisFaellig: null });
  if (v.status === "vorbereitung") return leer("vorbereitung");
  if (v.tarif === "befreit") return leer("befreit");
  const faelligAm = v.zahlungBis ?? v.zahlungFaelligAm ?? (v.tarif === "beta" ? BETA_ERSTE_FRIST : null);
  if (!faelligAm) return leer("beta_kostenlos");
  const tage = Math.ceil((faelligAm.getTime() - jetzt.getTime()) / TAG);
  const sperreAb = new Date(faelligAm.getTime() + KARENZ_TAGE * TAG);
  const ergebnis = (art: ZahlungsArt): ZahlungsStand => ({ art, faelligAm, sperreAb, tageBisFaellig: tage });
  if (jetzt.getTime() > faelligAm.getTime()) return ergebnis(jetzt.getTime() > sperreAb.getTime() && !v.zahlungSperreAus ? "gesperrt" : "ueberfaellig");
  if (!v.zahlungBis) {
    // noch nichts bezahlt: während der Beta kostenlos, danach läuft die Zahlungsfrist
    return ergebnis(betaVorbei(jetzt) || tage <= VORLAUF_TAGE ? "bald_faellig" : "beta_kostenlos");
  }
  return ergebnis(tage <= VORLAUF_TAGE ? "bald_faellig" : "bezahlt");
}

export const ZAHLUNGS_TEXT: Record<ZahlungsArt, string> = {
  vorbereitung: "In Vorbereitung",
  befreit: "Befreit",
  beta_kostenlos: "Beta, noch kostenlos",
  bezahlt: "Bezahlt",
  bald_faellig: "Rechnung/Zahlung bald fällig",
  ueberfaellig: "Überfällig",
  gesperrt: "Gesperrt",
};

// Dringlichkeit für die Sortierung der Liste (Dringendes zuerst).
export const ZAHLUNGS_RANG: Record<ZahlungsArt, number> = { gesperrt: 0, ueberfaellig: 1, bald_faellig: 2, beta_kostenlos: 3, bezahlt: 4, befreit: 5, vorbereitung: 6 };

const plusJahr = (d: Date) => {
  const n = new Date(d.getTime());
  n.setUTCFullYear(n.getUTCFullYear() + 1);
  return n;
};

// Vorschlag für "bezahlt bis": 12 Monate ab Zahlungsbeginn. Zahlungsbeginn = Ende der laufenden bezahlten Periode, bei Beta-Testern frühestens der
// 1.12.2026, sonst heute. Der Systemadmin kann das Datum beim Aktivieren ändern.
export function vorschlagBezahltBis(v: { tarif: Tarif; zahlungBis: Date | null }, jetzt: Date): Date {
  const laeuftNoch = v.zahlungBis && v.zahlungBis.getTime() > jetzt.getTime();
  const start = laeuftNoch ? v.zahlungBis! : v.tarif === "beta" && !betaVorbei(jetzt) ? BETA_ENDE_ZEITPUNKT : jetzt;
  const bis = plusJahr(start);
  bis.setTime(bis.getTime() - 1000); // 12 Monate, letzter Tag um 23:59:59 vor dem Folgejahrestag
  return bis;
}

// Stufen der Zahlungs-Mails: jede wird je Periode nur einmal verschickt (Marke "<fällig-Datum>:<Stufe>").
export type ZahlungsStufe = 1 | 2 | 3; // 1 = bald fällig, 2 = überfällig, 3 = gesperrt
export function stufeFuer(art: ZahlungsArt): ZahlungsStufe | null {
  return art === "bald_faellig" ? 1 : art === "ueberfaellig" ? 2 : art === "gesperrt" ? 3 : null;
}
export const zahlungsMarke = (faelligAm: Date, stufe: ZahlungsStufe) => `${faelligAm.toISOString().slice(0, 10)}:${stufe}`;
// true, wenn für diese Periode noch keine Mail dieser (oder höherer) Stufe rausging.
export function sollMailSenden(marke: string | null, faelligAm: Date, stufe: ZahlungsStufe): boolean {
  if (!marke) return true;
  const [datum, s] = marke.split(":");
  if (datum !== faelligAm.toISOString().slice(0, 10)) return true; // neue Periode
  return stufe > Number(s);
}
