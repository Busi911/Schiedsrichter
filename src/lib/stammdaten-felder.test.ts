import { describe, expect, it } from "vitest";
import { geaenderteStammdaten, pruefeStammdatenWert } from "./stammdaten-felder";

describe("geaenderteStammdaten", () => {
  it("erlaubt das Füllen eines leeren Felds", () => {
    expect(geaenderteStammdaten({ nuligaClubId: null }, { nuligaClubId: "123" })).toEqual([]);
    expect(geaenderteStammdaten({ nuligaHalle2Id: "" }, { nuligaHalle2Id: "55" })).toEqual([]);
  });
  it("meldet geänderte und geleerte Werte", () => {
    expect(geaenderteStammdaten({ nuligaClubId: "123" }, { nuligaClubId: "124" })).toEqual(["nuligaClubId"]);
    expect(geaenderteStammdaten({ nuligaClubId: "123" }, { nuligaClubId: "" })).toEqual(["nuligaClubId"]);
  });
  it("ignoriert unveränderte Werte trotz anderer Schreibweise", () => {
    expect(geaenderteStammdaten({ nuligaClubId: "123" }, { nuligaClubId: " 123 " })).toEqual([]);
    expect(geaenderteStammdaten({ handballNetTeamIds: "1, 2" }, { handballNetTeamIds: "1 2" })).toEqual([]);
    expect(
      geaenderteStammdaten({ eigeneHallenNamen: "Halle A\nHalle B" }, { eigeneHallenNamen: " halle a \r\n\r\nHalle B " })
    ).toEqual([]);
  });
  it("prüft Formate", () => {
    expect(pruefeStammdatenWert("nuligaClubId", "12a")).not.toBeNull();
    expect(pruefeStammdatenWert("nuligaClubId", "76446")).toBeNull();
    expect(pruefeStammdatenWert("handballNetClubId", "0b8y490")).toBeNull();
    expect(pruefeStammdatenWert("nuligaHalle1Id", "x")).not.toBeNull();
    expect(pruefeStammdatenWert("handballNetTeamIds", "")).toBeNull();
  });
});
