import { describe, expect, it } from "vitest";
import { ermittleAutomatischeZuordnungen } from "./handball-net-zuordnung";

const termin = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  handballNetSchiedsrichter: null,
  handballNetZeitnehmer: null,
  ...overrides,
});

describe("ermittleAutomatischeZuordnungen", () => {
  it("ordnet einen Schiedsrichter bei exaktem Namenstreffer automatisch zu", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetSchiedsrichter: "Levin Wanders" })],
      [],
      [{ userId: "u1", name: "Levin Wanders", email: "levin@example.org", typ: "schiedsrichter" }]
    );
    expect(ergebnis).toEqual([
      { terminId: "t1", userId: "u1", email: "levin@example.org", rolle: "schiedsrichter" },
    ]);
  });

  it("ordnet beide Namen eines Schiedsrichter-Gespanns zu", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetSchiedsrichter: "Levin Wanders, Georgios Dalampakis" })],
      [],
      [
        { userId: "u1", name: "Levin Wanders", email: "a@example.org", typ: "schiedsrichter" },
        { userId: "u2", name: "Georgios Dalampakis", email: "b@example.org", typ: "schiedsrichter" },
      ]
    );
    expect(ergebnis).toHaveLength(2);
    expect(ergebnis.map((z) => z.userId).sort()).toEqual(["u1", "u2"]);
  });

  it("liefert nichts, wenn kein Funktionsträger exakt passt (Normalfall bei DHB-gestellten Schiedsrichtern)", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetSchiedsrichter: "Levin Wanders" })],
      [],
      [{ userId: "u1", name: "Max Mustermann", email: "max@example.org", typ: "schiedsrichter" }]
    );
    expect(ergebnis).toEqual([]);
  });

  it("übernimmt NUR bei exaktem Treffer, nicht bei einem unsicheren Fuzzy-Vorschlag", () => {
    // Nur der Vorname passt (findeNamensVorschlag liefert das als
    // 'vorschlag', nicht als 'exakt') — ohne Wart, der das bestätigen
    // könnte, wird hier bewusst NICHT automatisch zugeordnet.
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetZeitnehmer: "Thomas" })],
      [],
      [{ userId: "u1", name: "Thomas Knop", email: "thomas@example.org", typ: "zeitnehmer" }]
    );
    expect(ergebnis).toEqual([]);
  });

  it("versucht bei Zeitnehmer/Sekretär zunächst die Rolle 'zeitnehmer'", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetZeitnehmer: "Thomas Knop" })],
      [],
      [{ userId: "u1", name: "Thomas Knop", email: "thomas@example.org", typ: "zeitnehmer" }]
    );
    expect(ergebnis).toEqual([
      { terminId: "t1", userId: "u1", email: "thomas@example.org", rolle: "zeitnehmer" },
    ]);
  });

  it("ordnet als 'sekretaer' zu, wenn die Person nur diese Rolle hat", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetZeitnehmer: "Kathrin Langenbach" })],
      [],
      [
        {
          userId: "u1",
          name: "Kathrin Langenbach",
          email: "kathrin@example.org",
          typ: "sekretaer",
        },
      ]
    );
    expect(ergebnis).toEqual([
      { terminId: "t1", userId: "u1", email: "kathrin@example.org", rolle: "sekretaer" },
    ]);
  });

  it("bevorzugt bei mehrdeutiger Rolle die Position: erster Name -> zeitnehmer, auch wenn die Person beide Rollen hat", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetZeitnehmer: "Alex Muster" })],
      [],
      [
        { userId: "u1", name: "Alex Muster", email: "a@example.org", typ: "zeitnehmer" },
        { userId: "u1", name: "Alex Muster", email: "a@example.org", typ: "sekretaer" },
      ]
    );
    expect(ergebnis).toEqual([
      { terminId: "t1", userId: "u1", email: "a@example.org", rolle: "zeitnehmer" },
    ]);
  });

  it("bevorzugt bei mehrdeutiger Rolle die Position: zweiter Name -> sekretaer, auch wenn die Person beide Rollen hat", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetZeitnehmer: "Egal Wer, Alex Muster" })],
      [],
      [
        { userId: "u0", name: "Egal Wer", email: "egal@example.org", typ: "zeitnehmer" },
        { userId: "u1", name: "Alex Muster", email: "a@example.org", typ: "zeitnehmer" },
        { userId: "u1", name: "Alex Muster", email: "a@example.org", typ: "sekretaer" },
      ]
    );
    expect(ergebnis).toContainEqual({
      terminId: "t1",
      userId: "u1",
      email: "a@example.org",
      rolle: "sekretaer",
    });
  });

  it("ordnet beide Zeitnehmer/Sekretär-Namen unabhängig voneinander zu", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetZeitnehmer: "Thomas Knop, Kathrin Langenbach" })],
      [],
      [
        { userId: "u1", name: "Thomas Knop", email: "a@example.org", typ: "zeitnehmer" },
        { userId: "u2", name: "Kathrin Langenbach", email: "b@example.org", typ: "sekretaer" },
      ]
    );
    expect(ergebnis).toHaveLength(2);
    expect(ergebnis).toContainEqual({
      terminId: "t1",
      userId: "u1",
      email: "a@example.org",
      rolle: "zeitnehmer",
    });
    expect(ergebnis).toContainEqual({
      terminId: "t1",
      userId: "u2",
      email: "b@example.org",
      rolle: "sekretaer",
    });
  });

  it("überspringt eine Person, die für diesen Termin/diese Rolle schon zugeordnet ist", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetSchiedsrichter: "Levin Wanders" })],
      [{ terminId: "t1", userId: "u1", funktionstraegerTyp: "schiedsrichter" }],
      [{ userId: "u1", name: "Levin Wanders", email: "levin@example.org", typ: "schiedsrichter" }]
    );
    expect(ergebnis).toEqual([]);
  });

  it("ordnet keinen dritten Schiedsrichter zu (Gespann-Maximum 2 bereits erreicht)", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetSchiedsrichter: "Dritter Name" })],
      [
        { terminId: "t1", userId: "u1", funktionstraegerTyp: "schiedsrichter" },
        { terminId: "t1", userId: "u2", funktionstraegerTyp: "schiedsrichter" },
      ],
      [{ userId: "u3", name: "Dritter Name", email: "dritter@example.org", typ: "schiedsrichter" }]
    );
    expect(ergebnis).toEqual([]);
  });

  it("ordnet keinen zweiten Zeitnehmer zu (Rolle ist bereits mit einer Person besetzt)", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin({ handballNetZeitnehmer: "Weitere Person" })],
      [{ terminId: "t1", userId: "u1", funktionstraegerTyp: "zeitnehmer" }],
      [
        {
          userId: "u2",
          name: "Weitere Person",
          email: "weitere@example.org",
          typ: "zeitnehmer",
        },
      ]
    );
    expect(ergebnis).toEqual([]);
  });

  it("lässt Termine ohne handball.net-Ansetzung unangetastet", () => {
    const ergebnis = ermittleAutomatischeZuordnungen(
      [termin()],
      [],
      [{ userId: "u1", name: "Egal", email: "egal@example.org", typ: "schiedsrichter" }]
    );
    expect(ergebnis).toEqual([]);
  });
});
