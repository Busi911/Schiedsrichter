import { describe, expect, it } from "vitest";
import { aktuellerBereich, SYSTEM_BEREICHE } from "./system-navigation";

describe("Systemadmin-Navigation", () => {
  it("ordnet jede Seite dem richtigen Bereich zu; die Übersicht nur auf /system selbst", () => {
    expect(aktuellerBereich("/system")?.key).toBe("uebersicht");
    expect(aktuellerBereich("/system/warteliste")?.key).toBe("vereine");
    expect(aktuellerBereich("/system/vereine/irgendwas")?.key).toBe("vereine");
    expect(aktuellerBereich("/system/sponsor")?.key).toBe("abrechnung");
    expect(aktuellerBereich("/system/ndr")?.key).toBe("spieldaten");
    expect(aktuellerBereich("/system/nuliga-diagnose")?.key).toBe("spieldaten");
    expect(aktuellerBereich("/system/mail")?.key).toBe("betrieb");
    expect(aktuellerBereich("/system/unbekannt")).toBeNull();
  });
  it("jede Seite kommt genau einmal vor", () => {
    const hrefs = SYSTEM_BEREICHE.flatMap((b) => b.unter.map((s) => s.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
