import { describe, expect, it } from "vitest";
import {
  expandiereRollenTypen,
  gruppiereLizenzRollen,
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

describe("Lizenz-Erinnerung: Zeitnehmer/Sekretär zusammen", () => {
  const RANG = { "60_tage": 1, "30_tage": 2, "7_tage": 3, abgelaufen: 4 };
  const d = new Date("2027-03-01T00:00:00Z");
  const r = (rolleId: string, userId: string, typ: string, stufeBisher: string | null = null, gueltigBis: Date | null = d) => ({ rolleId, userId, typ, gueltigBis, stufeBisher });

  it("beide Rollen mit gleichem Datum = eine Erinnerung, Stufe wird für beide gemerkt", () => {
    const e = gruppiereLizenzRollen([r("a", "u1", "zeitnehmer"), r("b", "u1", "sekretaer"), r("c", "u1", "schiedsrichter")], LABEL, RANG);
    expect(e.map((x) => x.label)).toEqual(["Zeitnehmer/Sekretär", "schiedsrichter"].map((l) => (l === "schiedsrichter" ? "Schiedsrichter" : l)));
    expect(e[0].rolleIds).toEqual(["a", "b"]);
  });
  it("als bisherige Stufe zählt die niedrigere, andere Personen/Daten bleiben getrennt", () => {
    const e = gruppiereLizenzRollen([r("a", "u1", "zeitnehmer", "30_tage"), r("b", "u1", "sekretaer", null)], LABEL, RANG);
    expect(e[0].stufeBisher).toBeNull();
    const getrennt = gruppiereLizenzRollen(
      [r("a", "u1", "zeitnehmer"), r("b", "u2", "sekretaer"), r("c", "u1", "sekretaer", null, new Date("2028-01-01T00:00:00Z"))],
      LABEL,
      RANG
    );
    expect(getrennt).toHaveLength(3);
  });
});
