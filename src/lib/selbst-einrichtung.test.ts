import { describe, expect, it } from "vitest";
import { pruefeEinrichtungsEingabe, sollEinrichtungsAssistentZeigen } from "./selbst-einrichtung";

describe("pruefeEinrichtungsEingabe", () => {
  it("nuLiga: nur Ziffern, handball.net-Feld wird ignoriert", () => {
    expect(pruefeEinrichtungsEingabe({ quelle: "nuliga", nuligaClubId: " 69723 ", handballNetClubId: "0b8y490" })).toEqual({
      nuligaClubId: "69723",
      handballNetClubId: null,
    });
  });
  it("handball.net: nuLiga-Feld wird ignoriert", () => {
    expect(pruefeEinrichtungsEingabe({ quelle: "handball_net", nuligaClubId: "123", handballNetClubId: "0b8y490" })).toEqual({
      nuligaClubId: null,
      handballNetClubId: "0b8y490",
    });
  });
  it("beide / unbekannt: eine ID genügt, beide sind möglich", () => {
    expect(pruefeEinrichtungsEingabe({ quelle: "beide", nuligaClubId: "", handballNetClubId: "0b8y490" })).toEqual({
      nuligaClubId: null,
      handballNetClubId: "0b8y490",
    });
    expect(pruefeEinrichtungsEingabe({ quelle: "x", nuligaClubId: "1", handballNetClubId: "abc" })).toEqual({
      nuligaClubId: "1",
      handballNetClubId: "abc",
    });
  });
  it("ohne ID und bei ungültigen Werten ein Fehler", () => {
    expect(pruefeEinrichtungsEingabe({ quelle: "beide", nuligaClubId: "", handballNetClubId: "" })).toHaveProperty("fehler");
    expect(pruefeEinrichtungsEingabe({ quelle: "nuliga", nuligaClubId: "", handballNetClubId: "0b8y490" })).toHaveProperty("fehler");
    expect(pruefeEinrichtungsEingabe({ quelle: "nuliga", nuligaClubId: "14194a", handballNetClubId: "" })).toHaveProperty("fehler");
    expect(pruefeEinrichtungsEingabe({ quelle: "handball_net", nuligaClubId: "", handballNetClubId: "a b" })).toHaveProperty("fehler");
  });
});

describe("sollEinrichtungsAssistentZeigen", () => {
  const basis = { spielplanAngebunden: false, uebersprungen: false, istDemo: false, treuhand: false, istAdmin: true };
  it("zeigt sich nur für einen Vereinsadmin ohne angebundenen Spielplan", () => {
    expect(sollEinrichtungsAssistentZeigen(basis)).toBe(true);
    expect(sollEinrichtungsAssistentZeigen({ ...basis, spielplanAngebunden: true })).toBe(false);
    expect(sollEinrichtungsAssistentZeigen({ ...basis, uebersprungen: true })).toBe(false);
    expect(sollEinrichtungsAssistentZeigen({ ...basis, istDemo: true })).toBe(false);
    expect(sollEinrichtungsAssistentZeigen({ ...basis, treuhand: true })).toBe(false);
    expect(sollEinrichtungsAssistentZeigen({ ...basis, istAdmin: false })).toBe(false);
  });
});
