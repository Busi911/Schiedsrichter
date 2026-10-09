import { describe, expect, it } from "vitest";
import {
  expandiereRollenTypen,
  fasseRollenZusammen,
  kombiniereRollenLabels,
  rollenZurAuswahl,
  ZEITNEHMER_SEKRETAER_TYP,
} from "./funktionstraeger-rollen";

const LABEL = { schiedsrichter: "Schiedsrichter", zeitnehmer: "Zeitnehmer", sekretaer: "Sekretär", trainer: "Trainer" };

describe("Zeitnehmer/Sekretär als eine Funktion", () => {
  it("die Sammelrolle und jede der beiden Einzelrollen ergeben beide Rollen, ohne Dubletten", () => {
    expect(expandiereRollenTypen([ZEITNEHMER_SEKRETAER_TYP])).toEqual(["zeitnehmer", "sekretaer"]);
    expect(expandiereRollenTypen(["sekretaer"])).toEqual(["zeitnehmer", "sekretaer"]);
    expect(expandiereRollenTypen(["trainer", "zeitnehmer", "sekretaer"])).toEqual(["trainer", "zeitnehmer", "sekretaer"]);
    expect(expandiereRollenTypen(["schiedsrichter"])).toEqual(["schiedsrichter"]);
  });
  it("Info-Mail nennt beide neuen Rollen als eine", () => {
    expect(kombiniereRollenLabels(["Trainer", "Zeitnehmer", "Sekretär"])).toEqual(["Trainer", "Zeitnehmer/Sekretär"]);
    expect(kombiniereRollenLabels(["Zeitnehmer"])).toEqual(["Zeitnehmer"]);
  });
  it("Anzeige: beide aktiven Rollen werden eine Zeile, eine einzelne bleibt allein, inaktive nur untereinander", () => {
    const rollen = [
      { rolleId: "a", typ: "zeitnehmer", aktiv: true },
      { rolleId: "b", typ: "sekretaer", aktiv: true },
      { rolleId: "c", typ: "trainer", aktiv: true, mannschaftName: "mC" },
    ];
    const z = fasseRollenZusammen(rollen, LABEL);
    expect(z.map((e) => e.label)).toEqual(["Zeitnehmer/Sekretär", "Trainer (mC)"]);
    expect(z[0].rollen.map((r) => r.rolleId)).toEqual(["a", "b"]);
    const gemischt = fasseRollenZusammen(
      [
        { rolleId: "a", typ: "zeitnehmer", aktiv: true },
        { rolleId: "b", typ: "sekretaer", aktiv: false },
      ],
      LABEL
    );
    expect(gemischt.map((e) => e.label)).toEqual(["Zeitnehmer", "Sekretär"]);
    expect(fasseRollenZusammen([{ rolleId: "x", typ: "sekretaer", aktiv: true }], LABEL)[0].label).toBe("Sekretär");
  });
  it("Auswahlliste hat Zeitnehmer/Sekretär einmal", () => {
    const liste = rollenZurAuswahl(LABEL);
    expect(liste.map(([v]) => v)).toEqual(["schiedsrichter", ZEITNEHMER_SEKRETAER_TYP, "trainer"]);
  });
});
