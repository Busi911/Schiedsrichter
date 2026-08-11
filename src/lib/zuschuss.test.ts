import { describe, expect, it } from "vitest";
import { zuschuesseAlsCsv } from "./zuschuss";

const basisZeile = {
  id: "z1",
  terminId: "t1",
  userId: "u1",
  satz: "25.00",
  berechneterBetrag: "25.00",
  status: "offen" as const,
  terminStart: new Date("2026-05-01T10:00:00Z"),
  terminBeschreibung: "TuS gegen SV",
  personName: "Dennis Weber",
  personEmail: "dennis@example.org",
};

describe("zuschuesseAlsCsv", () => {
  it("enthält Kopfzeile und Datenzeile mit den erwarteten Feldern", () => {
    const csv = zuschuesseAlsCsv([basisZeile]);
    const zeilen = csv.replace(/^﻿/, "").split("\n");

    expect(zeilen[0]).toBe("Datum;Beschreibung;Person;E-Mail;Satz;Betrag;Status");
    expect(zeilen[1]).toContain("Dennis Weber");
    expect(zeilen[1]).toContain("dennis@example.org");
    expect(zeilen[1]).toContain("25.00");
    expect(zeilen[1]).toContain("offen");
  });

  it("escaped Felder mit Semikolon oder Anführungszeichen korrekt", () => {
    const csv = zuschuesseAlsCsv([
      { ...basisZeile, terminBeschreibung: 'TuS; "Halle 2"' },
    ]);
    expect(csv).toContain('"TuS; ""Halle 2"""');
  });

  it("liefert nur die Kopfzeile bei leerer Liste", () => {
    const csv = zuschuesseAlsCsv([]);
    expect(csv.replace(/^﻿/, "")).toBe(
      "Datum;Beschreibung;Person;E-Mail;Satz;Betrag;Status"
    );
  });
});
