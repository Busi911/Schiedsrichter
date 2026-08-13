import { describe, expect, it } from "vitest";
import { findeNamensVorschlag } from "./namens-abgleich";

const KANDIDATEN = [
  { userId: "1", name: "Julia Meier" },
  { userId: "2", name: "Thomas Beispielmann" },
  { userId: "3", name: "Sabine Müller" },
];

describe("findeNamensVorschlag", () => {
  it("findet einen exakten Treffer bei identischem Namen", () => {
    const { exakt, vorschlag } = findeNamensVorschlag("Julia Meier", KANDIDATEN);
    expect(exakt?.userId).toBe("1");
    expect(vorschlag).toBeNull();
  });

  it("ist unempfindlich gegenüber Groß-/Kleinschreibung und Whitespace", () => {
    const { exakt } = findeNamensVorschlag("  julia   MEIER  ", KANDIDATEN);
    expect(exakt?.userId).toBe("1");
  });

  it("ist unempfindlich gegenüber Umlaut-Schreibweisen", () => {
    const { exakt } = findeNamensVorschlag("Sabine Muller", KANDIDATEN);
    expect(exakt?.userId).toBe("3");
  });

  it("schlägt bei nur dem Vornamen den passenden Kandidaten vor", () => {
    const { exakt, vorschlag } = findeNamensVorschlag("Julia", KANDIDATEN);
    expect(exakt).toBeNull();
    expect(vorschlag?.userId).toBe("1");
  });

  it("schlägt bei einem Tippfehler den passenden Kandidaten vor", () => {
    const { exakt, vorschlag } = findeNamensVorschlag("Julia Meyer", KANDIDATEN);
    expect(exakt).toBeNull();
    expect(vorschlag?.userId).toBe("1");
  });

  it("macht keinen Vorschlag, wenn kein Kandidat ausreichend passt", () => {
    const { exakt, vorschlag } = findeNamensVorschlag(
      "Ganz Anderer Name",
      KANDIDATEN
    );
    expect(exakt).toBeNull();
    expect(vorschlag).toBeNull();
  });

  it("gibt keinen Treffer/Vorschlag zurück, wenn keine Kandidaten vorhanden sind", () => {
    const { exakt, vorschlag } = findeNamensVorschlag("Julia Meier", []);
    expect(exakt).toBeNull();
    expect(vorschlag).toBeNull();
  });

  it("ignoriert Kandidaten ohne Namen", () => {
    const { exakt, vorschlag } = findeNamensVorschlag("Julia Meier", [
      { userId: "9", name: null },
    ]);
    expect(exakt).toBeNull();
    expect(vorschlag).toBeNull();
  });
});
