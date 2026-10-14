import { describe, expect, it } from "vitest";
import { wartOnboardingOffen, wartSchritte, WART_ROLLEN, type WartStand } from "./wart-onboarding";

const leer: WartStand = { personen: 0, linkAktiv: false, einteilungen: 0, istAdmin: true };
const alles: WartStand = { personen: 3, linkAktiv: true, einteilungen: 5, istAdmin: true };

describe("wartSchritte", () => {
  it("jede Rolle hat Schritte; neu = offen, alles erledigt = Karte verschwindet", () => {
    for (const rolle of WART_ROLLEN) {
      expect(wartSchritte(rolle, leer).length).toBeGreaterThanOrEqual(3);
      expect(wartOnboardingOffen(wartSchritte(rolle, leer))).toBe(true);
      expect(wartOnboardingOffen(wartSchritte(rolle, alles))).toBe(false);
    }
  });

  it("Haken kommen aus den Daten, Tipps zählen nicht", () => {
    const s = wartSchritte("zeitnehmer", { ...leer, linkAktiv: true });
    expect(s.find((x) => x.schluessel === "link")?.erledigt).toBe(true);
    expect(s.find((x) => x.schluessel === "einteilen")?.erledigt).toBe(false);
    expect(s.find((x) => x.schluessel === "tipp")?.erledigt).toBeNull();
  });

  it("Schiedsrichterwart hat keinen Eintragungslink-Schritt", () => {
    expect(wartSchritte("schiedsrichter", leer).some((x) => x.schluessel === "link")).toBe(false);
  });

  it("ein Wart ohne Admin-Rechte bekommt keine Link-Ziele in den Admin-Bereich", () => {
    for (const rolle of WART_ROLLEN) {
      for (const s of wartSchritte(rolle, { ...leer, istAdmin: false })) {
        expect(s.href === undefined || s.href.startsWith("#")).toBe(true);
      }
    }
  });
});
