import { describe, expect, it } from "vitest";
import {
  BETA_ERSTE_FRIST,
  betragNetto,
  sollMailSenden,
  startKonditionen,
  vorschlagBezahltBis,
  zahlungsMarke,
  zahlungsStand,
  type ZahlungsEingabe,
} from "./abrechnung";

const tag = (s: string) => new Date(`${s}T12:00:00+01:00`);
const basis: ZahlungsEingabe = { status: "aktiv", tarif: "beta", zahlungBis: null, zahlungFaelligAm: null, zahlungSperreAus: false };

describe("Beträge (netto)", () => {
  it("Tarife und Sponsor: der Sponsor zahlt alles (Vereinspreis + 200 € Werbeplatz)", () => {
    expect(betragNetto("befreit", false)).toBe(0);
    expect(betragNetto("beta", false)).toBe(200);
    expect(betragNetto("regulaer", false)).toBe(300);
    expect(betragNetto("beta", true)).toBe(400);
    expect(betragNetto("regulaer", true)).toBe(500);
    expect(betragNetto("befreit", true)).toBe(200); // nur der Werbeplatz
  });
});

describe("Startkonditionen neuer Vereine", () => {
  it("vor dem Beta-Ende Beta-Tester ohne feste Frist, danach regulär mit 30 Tagen", () => {
    expect(startKonditionen(tag("2026-11-15"))).toEqual({ tarif: "beta", zahlungFaelligAm: null });
    const k = startKonditionen(tag("2026-12-05"));
    expect(k.tarif).toBe("regulaer");
    expect(k.zahlungFaelligAm!.toISOString().slice(0, 10)).toBe("2027-01-04");
  });
});

describe("Zahlungsstand", () => {
  it("Vorbereitung und befreite Vereine haben nichts zu zahlen und werden nie gesperrt", () => {
    expect(zahlungsStand({ ...basis, status: "vorbereitung" }, tag("2030-01-01")).art).toBe("vorbereitung");
    expect(zahlungsStand({ ...basis, tarif: "befreit" }, tag("2030-01-01")).art).toBe("befreit");
  });
  it("Beta-Tester: kostenlos bis zum Vorlauf, ab 1.12. bald fällig, nach 31.12. überfällig, nach 30 Tagen Karenz gesperrt", () => {
    expect(zahlungsStand(basis, tag("2026-10-07")).art).toBe("beta_kostenlos");
    expect(zahlungsStand(basis, tag("2026-12-01")).art).toBe("bald_faellig");
    expect(zahlungsStand(basis, tag("2027-01-02")).art).toBe("ueberfaellig");
    expect(zahlungsStand(basis, tag("2027-02-05")).art).toBe("gesperrt");
    expect(zahlungsStand({ ...basis, zahlungSperreAus: true }, tag("2027-02-05")).art).toBe("ueberfaellig");
    expect(zahlungsStand(basis, tag("2026-10-07")).faelligAm).toEqual(BETA_ERSTE_FRIST);
  });
  it("bezahlt bis: bezahlt, 30 Tage vor Ablauf bald fällig, danach überfällig", () => {
    const b = { ...basis, zahlungBis: tag("2027-11-30") };
    expect(zahlungsStand(b, tag("2027-03-01")).art).toBe("bezahlt");
    expect(zahlungsStand(b, tag("2027-11-10")).art).toBe("bald_faellig");
    expect(zahlungsStand(b, tag("2027-12-05")).art).toBe("ueberfaellig");
  });
  it("neuer regulärer Verein: Zahlungsfrist läuft (bald fällig), dann überfällig", () => {
    const n = { ...basis, tarif: "regulaer" as const, zahlungFaelligAm: tag("2027-01-04") };
    expect(zahlungsStand(n, tag("2026-12-05")).art).toBe("bald_faellig");
    expect(zahlungsStand(n, tag("2027-01-10")).art).toBe("ueberfaellig");
  });
});

describe("bezahlt bis (Vorschlag) und Mail-Stufen", () => {
  it("Beta-Tester vor dem 1.12.: 12 Monate ab 1.12.2026; sonst ab Ende der laufenden Periode bzw. heute", () => {
    expect(vorschlagBezahltBis({ tarif: "beta", zahlungBis: null }, tag("2026-10-07")).toISOString().slice(0, 10)).toBe("2027-11-30");
    expect(vorschlagBezahltBis({ tarif: "beta", zahlungBis: tag("2027-11-30") }, tag("2027-11-10")).toISOString().slice(0, 10)).toBe("2028-11-30");
    expect(vorschlagBezahltBis({ tarif: "regulaer", zahlungBis: null }, tag("2027-01-20")).toISOString().slice(0, 10)).toBe("2028-01-20");
  });
  it("jede Stufe geht je Periode nur einmal raus; eine neue Periode setzt zurück", () => {
    const f = tag("2026-12-31");
    expect(sollMailSenden(null, f, 1)).toBe(true);
    expect(sollMailSenden(zahlungsMarke(f, 1), f, 1)).toBe(false);
    expect(sollMailSenden(zahlungsMarke(f, 1), f, 2)).toBe(true);
    expect(sollMailSenden(zahlungsMarke(f, 3), f, 2)).toBe(false);
    expect(sollMailSenden(zahlungsMarke(f, 3), tag("2027-11-30"), 1)).toBe(true);
  });

  it("verschobenes Zahlungsziel (Beta für einen Verein verlängert): kostenlos bis 30 Tage vor dem neuen Ziel, dann bald fällig", () => {
    const v = { ...basis, zahlungFaelligAm: tag("2027-03-31") };
    expect(zahlungsStand(v, tag("2026-12-05")).art).toBe("beta_kostenlos");
    expect(zahlungsStand(v, tag("2027-03-05")).art).toBe("bald_faellig");
    expect(zahlungsStand(v, tag("2027-04-05")).art).toBe("ueberfaellig");
  });
});
