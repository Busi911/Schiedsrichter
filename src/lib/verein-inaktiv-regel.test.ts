import { describe, expect, it } from "vitest";
import { sollInaktivWerden, type InaktivEingabe } from "./verein-inaktiv-regel";

const JETZT = new Date("2026-11-01T10:00:00Z");
const tage = (n: number) => new Date(JETZT.getTime() - n * 24 * 3600 * 1000);
const basis: InaktivEingabe = {
  status: "vorbereitung",
  istDemo: false,
  angeschriebenAm: tage(15),
  anspracheGesendetAm: null,
  anspracheEmail: null,
  followupGesendetAm: null,
  outreachAbgemeldetAm: null,
  inaktivSeit: null,
  hatGueltigenLink: false,
};

describe("sollInaktivWerden", () => {
  it("angeschrieben vor 15 Tagen, kein Link: inaktiv", () => expect(sollInaktivWerden(basis, JETZT)).toBe(true));
  it("noch keine 14 Tage: nein", () => expect(sollInaktivWerden({ ...basis, angeschriebenAm: tage(10) }, JETZT)).toBe(false));
  it("nie angeschrieben: nein", () => expect(sollInaktivWerden({ ...basis, angeschriebenAm: null }, JETZT)).toBe(false));
  it("gültiger Link: nein", () => expect(sollInaktivWerden({ ...basis, hatGueltigenLink: true }, JETZT)).toBe(false));
  it("aktive Vereine und der Demo-Verein nie", () => {
    expect(sollInaktivWerden({ ...basis, status: "aktiv" }, JETZT)).toBe(false);
    expect(sollInaktivWerden({ ...basis, istDemo: true }, JETZT)).toBe(false);
  });
  it("schon inaktiv: nicht erneut", () => expect(sollInaktivWerden({ ...basis, inaktivSeit: tage(1) }, JETZT)).toBe(false));
  it("Mail-Ansprache: erst nach der Erinnerung", () => {
    const mail = { ...basis, angeschriebenAm: null, anspracheEmail: "a@b.de", anspracheGesendetAm: tage(20) };
    expect(sollInaktivWerden(mail, JETZT)).toBe(false);
    expect(sollInaktivWerden({ ...mail, followupGesendetAm: tage(13) }, JETZT)).toBe(true);
  });
  it("Abmeldung: sofort", () => expect(sollInaktivWerden({ ...basis, angeschriebenAm: tage(1), outreachAbgemeldetAm: tage(1) }, JETZT)).toBe(true));
});
