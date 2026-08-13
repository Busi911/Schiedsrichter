import { describe, expect, it } from "vitest";
import { findeDuplikatPaare } from "./duplikat-erkennung";

describe("findeDuplikatPaare", () => {
  it("findet ein Duplikat, wenn der Team-Name im Testspiel-Text vorkommt (auch bei abweichender Uhrzeit)", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "t1",
          start: new Date("2026-09-01T10:00:00+02:00"),
          beschreibung: "TV Musterstadt gegen Gastverein",
          besetzung: ["Schiedsrichter: Max Muster"],
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
    expect(treffer[0]).toMatchObject({ testspielId: "t1", rundenspielId: "r1" });
    expect(treffer[0].testspielBesetzung).toEqual(["Schiedsrichter: Max Muster"]);
  });

  it("findet ein Duplikat bei Zeitnähe, auch ohne Namensübereinstimmung", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "t1",
          start: new Date("2026-09-01T18:00:00+02:00"),
          beschreibung: "Freundschaftsspiel",
          besetzung: [],
        },
      ],
      [
        {
          id: "r1",
          start: new Date("2026-09-01T19:30:00+02:00"),
          beschreibung: null,
          besetzung: [],
          heimMannschaftName: "Anderer Verein",
          auswaertsMannschaftName: "Noch ein Verein",
        },
      ]
    );

    expect(treffer).toHaveLength(1);
  });

  it("meldet kein Duplikat an unterschiedlichen Tagen, selbst bei Namenstreffer", () => {
    const treffer = findeDuplikatPaare(
      [
        {
          id: "t1",
          start: new Date("2026-09-01T10:00:00+02:00"),
          beschreibung: "TV Musterstadt",
          besetzung: [],
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
          start: new Date("2026-09-01T10:00:00+02:00"),
          beschreibung: "Unbeteiligter Verein",
          besetzung: [],
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
});
