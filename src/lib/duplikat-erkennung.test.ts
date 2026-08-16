import { describe, expect, it } from "vitest";
import { findeDuplikatPaare } from "./duplikat-erkennung";

describe("findeDuplikatPaare", () => {
  it("findet ein Duplikat, wenn der Team-Name im Text vorkommt (auch bei abweichender Uhrzeit)", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "t1",
          typ: "testspiel",
          start: new Date("2026-09-01T10:00:00+02:00"),
          beschreibung: "TV Musterstadt gegen Gastverein",
          besetzung: ["Schiedsrichter: Max Muster"],
          turnierId: null,
        },
      ],
      [
        {
          id: "r1",
          start: new Date("2026-09-01T18:00:00+02:00"),
          beschreibung: "Ligaspiel",
          besetzung: [],
          heimMannschaftName: "TV Musterstadt",
          auswaertsMannschaftName: "Gastverein",
        },
      ]
    );

    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toMatchObject({ quellId: "t1", rundenspielId: "r1" });
    expect(treffer[0].quellBesetzung).toEqual(["Schiedsrichter: Max Muster"]);
  });

  it("findet ein Duplikat bei Zeitnähe (bis 30 Minuten), auch ohne Namensübereinstimmung", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "t1",
          typ: "testspiel",
          start: new Date("2026-09-01T18:00:00+02:00"),
          beschreibung: "Freundschaftsspiel",
          besetzung: [],
          turnierId: null,
        },
      ],
      [
        {
          id: "r1",
          start: new Date("2026-09-01T18:20:00+02:00"),
          beschreibung: null,
          besetzung: [],
          heimMannschaftName: "Anderer Verein",
          auswaertsMannschaftName: "Noch ein Verein",
        },
      ]
    );

    expect(treffer).toHaveLength(1);
  });

  it("meldet KEIN Duplikat mehr bei über 30 Minuten Abstand ohne Namenstreffer (z.B. dicht getakteter Turniertag)", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "ts1",
          typ: "turnier_spiel",
          start: new Date("2026-08-22T13:30:00+02:00"),
          beschreibung: "MJC",
          besetzung: [],
          turnierId: "turnier-1",
        },
      ],
      [
        {
          id: "r1",
          start: new Date("2026-08-22T11:30:00+02:00"),
          beschreibung: "Freundschaftsspiel",
          besetzung: [],
          heimMannschaftName: "KSG Bieber 1",
          auswaertsMannschaftName: "HSG Fernwald 1",
        },
      ]
    );

    expect(treffer).toHaveLength(0);
  });

  it("meldet kein Duplikat an unterschiedlichen Tagen, selbst bei Namenstreffer", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "t1",
          typ: "testspiel",
          start: new Date("2026-09-01T10:00:00+02:00"),
          beschreibung: "TV Musterstadt",
          besetzung: [],
          turnierId: null,
        },
      ],
      [
        {
          id: "r1",
          start: new Date("2026-09-02T10:00:00+02:00"),
          beschreibung: null,
          besetzung: [],
          heimMannschaftName: "TV Musterstadt",
          auswaertsMannschaftName: null,
        },
      ]
    );

    expect(treffer).toHaveLength(0);
  });

  it("meldet kein Duplikat am selben Tag ohne Namens- oder Zeitnähe-Treffer", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "t1",
          typ: "testspiel",
          start: new Date("2026-09-01T10:00:00+02:00"),
          beschreibung: "Unbeteiligter Verein",
          besetzung: [],
          turnierId: null,
        },
      ],
      [
        {
          id: "r1",
          start: new Date("2026-09-01T20:00:00+02:00"),
          beschreibung: null,
          besetzung: [],
          heimMannschaftName: "TV Musterstadt",
          auswaertsMannschaftName: "Gastverein",
        },
      ]
    );

    expect(treffer).toHaveLength(0);
  });

  it("findet ein Duplikat auch für ein Turnier-Einzelspiel und trägt dessen Turnier-Zugehörigkeit weiter", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "ts1",
          typ: "turnier_spiel",
          start: new Date("2026-08-22T11:30:00+02:00"),
          beschreibung: "TSF Heuchelheim – KSG Bieber",
          besetzung: [],
          turnierId: "turnier-1",
        },
      ],
      [
        {
          id: "r1",
          start: new Date("2026-08-22T11:30:00+02:00"),
          beschreibung: "Jugendspiel Nr. 42",
          besetzung: [],
          heimMannschaftName: "TSF Heuchelheim 1",
          auswaertsMannschaftName: "KSG Bieber 1",
        },
      ]
    );

    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toMatchObject({
      quellId: "ts1",
      quellTyp: "turnier_spiel",
      quellTurnierId: "turnier-1",
      rundenspielId: "r1",
    });
  });
});
