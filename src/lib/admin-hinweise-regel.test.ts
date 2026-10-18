import { describe, expect, it } from "vitest";
import { abschaltenErlaubt } from "./admin-hinweise-regel";

describe("abschaltenErlaubt", () => {
  it("der letzte aktive Admin darf nicht abschalten", () => {
    expect(abschaltenErlaubt({ istVollerAdmin: true, istAktiv: true, andereAktiveAdmins: 0 })).toBe(false);
  });
  it("bei zwei Admins darf einer abschalten (der andere bleibt aktiv)", () => {
    expect(abschaltenErlaubt({ istVollerAdmin: true, istAktiv: true, andereAktiveAdmins: 1 })).toBe(true);
  });
  it("wer die Hinweise ohnehin nicht bekommt oder kein voller Admin ist, ist nie blockiert", () => {
    expect(abschaltenErlaubt({ istVollerAdmin: true, istAktiv: false, andereAktiveAdmins: 0 })).toBe(true);
    expect(abschaltenErlaubt({ istVollerAdmin: false, istAktiv: true, andereAktiveAdmins: 0 })).toBe(true);
  });
});
