import { describe, expect, it } from "vitest";
import { feedbackAntwortInhalt } from "./feedback-antwort-mail";

describe("feedbackAntwortInhalt", () => {
  it("Anrede, Absätze der Antwort und Zitat", () => {
    const i = feedbackAntwortInhalt({ personName: "Anna", antwort: "Danke!\n\nIst behoben.", nachricht: "Fehler auf der Seite" });
    expect(i.zeilen[0]).toBe("Hallo Anna,");
    expect(i.zeilen).toContain("Danke!");
    expect(i.zeilen).toContain("Ist behoben.");
    expect(i.zeilen[i.zeilen.length - 1]).toBe("Fehler auf der Seite");
  });
  it("ohne Namen, langes Zitat gekürzt", () => {
    const i = feedbackAntwortInhalt({ personName: null, antwort: "ok", nachricht: "x".repeat(700) });
    expect(i.zeilen[0]).toBe("Hallo,");
    expect((i.zeilen[i.zeilen.length - 1] as string).length).toBeLessThan(700);
  });
});
