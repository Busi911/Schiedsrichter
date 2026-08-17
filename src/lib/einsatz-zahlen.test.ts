import { describe, expect, it } from "vitest";
import { mergeRollenZaehlungen, summiereZweiZaehlungen } from "./einsatz-zahlen";

describe("mergeRollenZaehlungen", () => {
  it("fasst eine Person mit zwei Rollen zu einem Eintrag mit beiden Rollen zusammen", () => {
    const ergebnis = mergeRollenZaehlungen(
      [
        { userId: "u1", name: "Anna", email: "anna@test.de", typ: "ordner" },
        { userId: "u1", name: "Anna", email: "anna@test.de", typ: "kioskdienst" },
      ],
      [{ userId: "u1", anzahl: 3 }]
    );

    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0].rollen.sort()).toEqual(["kioskdienst", "ordner"]);
    expect(ergebnis[0].anzahlEinsaetze).toBe(3);
  });

  it("führt eine doppelt vorhandene Rollen-Zeile (kein DB-Unique-Constraint) nur einmal auf", () => {
    const ergebnis = mergeRollenZaehlungen(
      [
        { userId: "u1", name: "Anna", email: "anna@test.de", typ: "zeitnehmer" },
        { userId: "u1", name: "Anna", email: "anna@test.de", typ: "zeitnehmer" },
        { userId: "u1", name: "Anna", email: "anna@test.de", typ: "sekretaer" },
      ],
      []
    );
    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0].rollen.sort()).toEqual(["sekretaer", "zeitnehmer"]);
  });

  it("hält zwei verschiedene Personen als separate Einträge auseinander", () => {
    const ergebnis = mergeRollenZaehlungen(
      [
        { userId: "u1", name: "Anna", email: "anna@test.de", typ: "ordner" },
        { userId: "u2", name: "Bea", email: "bea@test.de", typ: "ordner" },
      ],
      []
    );
    expect(ergebnis).toHaveLength(2);
  });

  it("setzt anzahlEinsaetze auf 0, wenn keine Zählung für die Person existiert", () => {
    const ergebnis = mergeRollenZaehlungen(
      [{ userId: "u1", name: "Anna", email: "anna@test.de", typ: "ordner" }],
      []
    );
    expect(ergebnis[0].anzahlEinsaetze).toBe(0);
  });

  it("wandelt eine als String gelieferte Zählung (COUNT-Rückgabe) in eine Zahl um", () => {
    const ergebnis = mergeRollenZaehlungen(
      [{ userId: "u1", name: "Anna", email: "anna@test.de", typ: "ordner" }],
      [{ userId: "u1", anzahl: "5" }]
    );
    expect(ergebnis[0].anzahlEinsaetze).toBe(5);
  });
});

describe("summiereZweiZaehlungen", () => {
  const basis = [{ userId: "u1", name: "Anna", email: "anna@test.de" }];

  it("summiert beide Zähl-Quellen für dieselbe Person", () => {
    const ergebnis = summiereZweiZaehlungen(
      basis,
      [{ userId: "u1", anzahl: 2 }],
      [{ userId: "u1", anzahl: 3 }]
    );
    expect(ergebnis[0].anzahlEinsaetze).toBe(5);
  });

  it("behandelt eine fehlende Zählung als 0", () => {
    const ergebnis = summiereZweiZaehlungen(basis, [{ userId: "u1", anzahl: 2 }], []);
    expect(ergebnis[0].anzahlEinsaetze).toBe(2);
  });

  it("ignoriert Zählungs-Zeilen ohne zugeordnete userId (z.B. noch offene ICS-Spiele)", () => {
    const ergebnis = summiereZweiZaehlungen(
      basis,
      [{ userId: null, anzahl: 7 }],
      [{ userId: "u1", anzahl: 1 }]
    );
    expect(ergebnis[0].anzahlEinsaetze).toBe(1);
  });
});
