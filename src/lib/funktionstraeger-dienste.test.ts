import { describe, expect, it } from "vitest";
import { fasseDiensteZusammen, saisonsAusZeilen } from "./funktionstraeger-dienste";

const jetzt = new Date("2026-10-20T12:00:00Z");
const anna = { userId: "a", name: "Anna", email: "a@x.de" };
const ben = { userId: "b", name: "Ben", email: "b@x.de" };

describe("fasseDiensteZusammen", () => {
  const zeilen = [
    { userId: "a", typ: "zeitnehmer", start: new Date("2026-10-10T10:00:00Z") },
    { userId: "a", typ: "ordner", start: new Date("2026-10-11T10:00:00Z") },
    { userId: "a", typ: "zeitnehmer", start: new Date("2026-11-01T10:00:00Z") },
    { userId: "a", typ: "trainer", start: new Date("2026-10-12T10:00:00Z") },
    { userId: "a", typ: "zeitnehmer", start: new Date("2026-01-10T10:00:00Z") },
  ];

  it("trennt geleistet/eingetragen und Rollen, ignoriert Nicht-Dienste", () => {
    const [a] = fasseDiensteZusammen([anna], zeilen, null, jetzt);
    expect(a.geleistet).toBe(3);
    expect(a.eingetragen).toBe(1);
    expect(a.nachRolle.zeitnehmer).toEqual({ geleistet: 2, eingetragen: 1 });
    expect(a.nachRolle.ordner).toEqual({ geleistet: 1, eingetragen: 0 });
  });

  it("filtert nach Saison", () => {
    const [a] = fasseDiensteZusammen([anna], zeilen, "2026/27", jetzt);
    expect(a.geleistet).toBe(2);
    expect(a.eingetragen).toBe(1);
  });

  it("behält Personen ohne Dienst und sortiert nach Einsätzen", () => {
    const liste = fasseDiensteZusammen([ben, anna], zeilen, null, jetzt);
    expect(liste.map((p) => p.userId)).toEqual(["a", "b"]);
    expect(liste[1].geleistet).toBe(0);
  });
});

describe("saisonsAusZeilen", () => {
  it("nennt neueste Saison zuerst und enthält die aktuelle", () => {
    expect(
      saisonsAusZeilen([{ userId: "a", typ: "ordner", start: new Date("2025-10-01T10:00:00Z") }], jetzt)
    ).toEqual(["2026/27", "2025/26"]);
  });
});
