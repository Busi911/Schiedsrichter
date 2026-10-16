import { istRollenSchluessel } from "./vereinstermine";
import { describe, expect, it } from "vitest";
import { baueDemoDaten, demoEmail, demoErsatzAdresse, DEMO_EMAIL_DOMAIN, istDemoAdresse } from "./demo-daten";

describe("baueDemoDaten", () => {
  const d = baueDemoDaten();

  it("hat eindeutige Schlüssel für Personen und Termine", () => {
    expect(new Set(d.personen.map((p) => p.key)).size).toBe(d.personen.length);
    expect(new Set(d.termine.map((t) => t.key)).size).toBe(d.termine.length);
    expect(new Set(d.personen.map((p) => demoEmail(p.key))).size).toBe(d.personen.length);
  });

  it("alle Zuordnungen verweisen auf vorhandene Termine, Personen und Vorschläge", () => {
    const termine = new Set(d.termine.map((t) => t.key));
    const personen = new Set(d.personen.map((p) => p.key));
    for (const z of d.zuordnungen) {
      expect(termine.has(z.termin), `Termin ${z.termin}`).toBe(true);
      if (z.person) expect(personen.has(z.person), `Person ${z.person}`).toBe(true);
      if (z.vorschlag) expect(personen.has(z.vorschlag), `Vorschlag ${z.vorschlag}`).toBe(true);
      // Entweder eine Person (zugeordnet) ODER ein Name zur Bestätigung (Selbsteintragung)
      expect(Boolean(z.person) !== Boolean(z.externerName)).toBe(true);
    }
  });

  it("Mannschaften in Terminen, Trainer-Rollen und Trainingsplan existieren", () => {
    const namen = new Set(d.mannschaften.map((m) => m.name));
    for (const t of d.termine) expect(namen.has(t.mannschaft), t.mannschaft).toBe(true);
    for (const p of d.personen) for (const r of p.rollen) if (r.mannschaft) expect(namen.has(r.mannschaft), r.mannschaft).toBe(true);
    for (const e of d.trainingsplan) expect(namen.has(e.mannschaft), e.mannschaft).toBe(true);
  });

  it("zeigt künftige Spiele in allen Besetzungsständen und genau ein vergangenes mit Ergebnis", () => {
    expect(d.termine.filter((t) => t.tage < 0)).toHaveLength(1);
    expect(d.termine.find((t) => t.tage < 0)?.ergebnis).toBeDefined();
    const zuordnungenJeTermin = (key: string) => d.zuordnungen.filter((z) => z.termin === key && z.person).length;
    const künftig = d.termine.filter((t) => t.tage > 0);
    expect(künftig.some((t) => zuordnungenJeTermin(t.key) >= 6)).toBe(true); // (fast) vollständig
    expect(künftig.some((t) => zuordnungenJeTermin(t.key) > 0 && zuordnungenJeTermin(t.key) < 5)).toBe(true); // teilweise
    expect(künftig.some((t) => zuordnungenJeTermin(t.key) === 0)).toBe(true); // leer
  });

  it("enthält die Fälle, die die Demo zeigen soll: Selbsteintragungen, Abmeldeanfrage, deaktivierte Person, Turnier", () => {
    expect(d.zuordnungen.filter((z) => z.quelle === "selbst_eingetragen_oeffentlich" && z.externerName).length).toBeGreaterThanOrEqual(3);
    expect(d.zuordnungen.some((z) => z.abmeldung)).toBe(true);
    expect(d.personen.some((p) => p.rollen.some((r) => r.aktiv === false))).toBe(true);
    expect(d.termine.some((t) => t.typ === "turnier")).toBe(true);
  });

  it("alle Demo-Adressen liegen unter der Demo-Domain", () => {
    for (const p of d.personen) expect(demoEmail(p.key).endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
  });

  it("Zeitnehmer/Sekretär-Personen haben immer beide Rollen (eine Funktion)", () => {
    for (const p of d.personen) {
      const typen = p.rollen.map((r) => r.typ);
      expect(typen.includes("zeitnehmer")).toBe(typen.includes("sekretaer"));
    }
  });
});

describe("demoErsatzAdresse", () => {
  it("ersetzt echte Adressen durch eine erfundene unter der Demo-Domain, stabil und unterscheidbar", () => {
    const a = demoErsatzAdresse("  Max.Muster@Example.com ");
    expect(a.endsWith(`@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(a).not.toContain("example.com");
    expect(demoErsatzAdresse("max.muster@example.com")).toBe(a);
    expect(demoErsatzAdresse("max.muster@example.org")).not.toBe(a);
    expect(istDemoAdresse(a)).toBe(true);
    expect(istDemoAdresse("max@example.com")).toBe(false);
  });

  it("lässt Adressen der Demo-Domain unverändert (Testpersonen bleiben dieselben)", () => {
    expect(demoErsatzAdresse(demoEmail("anna"))).toBe(demoEmail("anna"));
  });

  it("entfernt Sonderzeichen aus dem lokalen Teil", () => {
    expect(demoErsatzAdresse("<script>@x.de")).toMatch(/^script-[0-9a-f]{8}@/);
    expect(demoErsatzAdresse("@x.de")).toMatch(/^person-[0-9a-f]{8}@/);
  });
});

describe("Demo: eigene Dienste", () => {
  const d = baueDemoDaten();
  it("Einteilungen verweisen auf vorhandene Dienste, Termine und Personen, je Person oder Name", () => {
    const dienste = new Set(d.eigeneDienste.map((x) => x.key));
    const termine = new Set(d.termine.map((t) => t.key));
    const personen = new Set(d.personen.map((p) => p.key));
    const mannschaften = new Set(d.mannschaften.map((m) => m.name));
    for (const e of d.eigeneEinteilungen) {
      expect(dienste.has(e.dienst), e.dienst).toBe(true);
      expect(termine.has(e.termin), e.termin).toBe(true);
      if (e.person) expect(personen.has(e.person), e.person).toBe(true);
      expect(Boolean(e.person) !== Boolean(e.externerName)).toBe(true);
    }
    for (const x of d.eigeneDienste) for (const m of x.mannschaften ?? []) expect(mannschaften.has(m), m).toBe(true);
  });
  it("Fahrgemeinschaft: Mitfahrer nur bei Diensten mit Fahrgemeinschaft und nie mehr als Plätze", () => {
    const mitFahrt = new Set(d.eigeneDienste.filter((x) => x.fahrgemeinschaft).map((x) => x.key));
    const mitMitfahrern = d.eigeneEinteilungen.filter((e) => e.mitfahrer?.length);
    expect(mitMitfahrern.length).toBeGreaterThan(0);
    for (const e of mitMitfahrern) {
      expect(mitFahrt.has(e.dienst)).toBe(true);
      expect(e.mitfahrer!.length).toBeLessThanOrEqual(e.plaetze ?? 0);
    }
  });

  it("Vereinstermine: Antwortende, Rollen und Sichtbarkeit sind gültig", () => {
    const keys = new Set(d.personen.map((p) => p.key));
    expect(d.vereinstermine.length).toBeGreaterThanOrEqual(2);
    for (const t of d.vereinstermine) {
      for (const a of t.antworten) expect(keys.has(a.person), a.person).toBe(true);
      for (const r of t.rollen ?? []) expect(istRollenSchluessel(r), r).toBe(true);
      if (t.sichtbarkeit === "auswahl") expect((t.rollen ?? []).length).toBeGreaterThan(0);
      if (t.serie) expect(t.serie.bisTage).toBeGreaterThan(30);
    }
  });
});
