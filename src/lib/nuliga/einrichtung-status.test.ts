import { describe, expect, it } from "vitest";
import { bewerteEinrichtung, type EinrichtungsBefund } from "./einrichtung-status";

const basis: EinrichtungsBefund = {
  indexName: "HSG Linden",
  clubId: "76446",
  info: { name: "HSG Linden", nummer: "14194", gruendung: 2019, website: "https://x.invalid", stammvereine: [], hallen: ["Halle A"], logoPfad: "/x/wr?wodata=1", logoSicher: true },
  infoFehler: null,
  hallenGespeichert: ["Halle A"],
  syncStatus: "erfolgreich",
  syncUnvollstaendig: false,
  syncMeldungen: [],
  mannschaften: 9,
  termineAngelegt: 12,
  logo: { status: "neu" },
  logoSicher: true,
};
const status = (b: EinrichtungsBefund) => Object.fromEntries(bewerteEinrichtung(b).map((s) => [s.schluessel, s.status]));

describe("bewerteEinrichtung", () => {
  it("alles geklappt: nur die Hallen bleiben zur Prüfung", () => {
    expect(status(basis)).toEqual({ gefunden: "ok", stammdaten: "ok", hallen: "pruefen", mannschaften: "ok", termine: "ok", logo: "ok" });
  });
  it("meldet Fehler statt zu schweigen", () => {
    const s = status({ ...basis, info: null, infoFehler: "HTTP 503", mannschaften: 0, syncStatus: "fehler", hallenGespeichert: [], termineAngelegt: null });
    expect(s).toMatchObject({ stammdaten: "fehler", mannschaften: "fehler", hallen: "pruefen", termine: "pruefen" });
  });
  it("Logo: unsicher/fehlend/fehlgeschlagen werden nicht verschwiegen", () => {
    expect(status({ ...basis, logoSicher: false }).logo).toBe("pruefen");
    expect(status({ ...basis, logo: { status: "kein_logo" } }).logo).toBe("pruefen");
    expect(status({ ...basis, logo: { status: "fehler", detail: "HTTP 500" } }).logo).toBe("fehler");
  });
  it("unvollständiger Lauf ist kein Fehler, aber zu prüfen", () => {
    expect(status({ ...basis, syncUnvollstaendig: true }).mannschaften).toBe("pruefen");
  });
});
