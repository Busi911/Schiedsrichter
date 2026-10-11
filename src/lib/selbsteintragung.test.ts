// Unit-Test (ohne Datenbank) der gemeinsamen Selbsteintragungs-Logik für Zeitnehmer/Sekretär und Ordner/Kioskdienst/Kassierer:
// Token-/Rollen-Prüfung, Namensabgleich, Besetzungs-/Doppelrollen-Prüfung je Termin, Mails, Eingeloggt-Variante.
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserts: Record<string, unknown>[] = [];
const rollenInserts: Record<string, unknown>[] = [];
let vorhandeneRolle: { id: string; aktiv: boolean } | null = null;
let vereinZuToken: { id: string; name: string } | null = { id: "v1", name: "TSF" };
let terminListe: Record<string, { id: string; vereinId: string; start: Date; ort: string | null; beschreibung: string | null }> = {};
const mailSpy = vi.fn();
const alleSpy = vi.fn();

const fakeTx = {
  query: {
    termine: { findFirst: async () => null as unknown },
    funktionstraegerRollen: { findFirst: async () => vorhandeneRolle },
  },
  insert: (tabelle: unknown) => ({
    values: async (werte: Record<string, unknown>) => {
      // Rollen-Inserts haben "typ", Zuordnungen "funktionstraegerTyp"
      if ("funktionstraegerTyp" in werte) inserts.push(werte);
      else rollenInserts.push(werte);
      void tabelle;
    },
  }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
};

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({
  withTenant: async (_id: string, cb: (tx: unknown) => Promise<unknown>) => {
    fakeTx.query.termine.findFirst = async () => Object.values(terminListe)[currentTerminIndex++] ?? null;
    return cb(fakeTx);
  },
}));
vi.mock("@/db/admin", () => ({ adminDb: { query: { vereine: { findFirst: async () => vereinZuToken } } } }));
vi.mock("@/lib/mailer", () => ({ sendMail: (...a: unknown[]) => mailSpy(...a) }));
vi.mock("@/lib/session", () => ({ requireSession: async () => ({ user: { id: "u1", vereinId: sessionVereinId } }) }));
vi.mock("@/lib/zuordnung", async () => {
  const echt = await vi.importActual<typeof import("@/lib/zuordnung")>("@/lib/zuordnung");
  return { ...echt, sendeMailAnAlle: (...a: unknown[]) => alleSpy(...a), loeseIdentitaetPerEmailAuf: vi.fn() };
});

let currentTerminIndex = 0;
let sessionVereinId = "v1";

import { vereine } from "@/db/schema";
import { selbstEintragenMehrfachEingeloggt, selbstEintragenMehrfachOeffentlich, type SelbsteintragungBereich } from "./selbsteintragung";

function bereich(abweichung: Partial<SelbsteintragungBereich> = {}): SelbsteintragungBereich {
  return {
    rollen: ["zeitnehmer", "sekretaer"],
    tokenSpalte: vereine.zeitnehmerSelbstanmeldungToken,
    alterPfad: "/zeitnehmer-eintragen",
    wartSeite: "/profil/zeitnehmerwart",
    wartLabel: "Zeitnehmerwart",
    uebersichtLabel: "Zur Zeitnehmer-Übersicht",
    holeKandidaten: async () => [{ userId: "u-anna", email: "anna@example.test", name: "Anna Beispiel", rollen: ["zeitnehmer"] }],
    holeWarteEmails: async () => [{ email: "wart@example.test" }],
    pruefeBesetzung: async () => undefined,
    pruefeDoppelrolle: async () => ({ warnung: null }),
    ...abweichung,
  };
}

function formular(felder: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(felder)) for (const w of Array.isArray(v) ? v : [v]) fd.append(k, w);
  return fd;
}

const termin = (id: string) => ({ id, vereinId: "v1", start: new Date("2026-11-01T10:00:00Z"), ort: "Halle", beschreibung: null });

beforeEach(() => {
  inserts.length = 0;
  rollenInserts.length = 0;
  vorhandeneRolle = null;
  vereinZuToken = { id: "v1", name: "TSF" };
  terminListe = { t1: termin("t1"), t2: termin("t2") };
  currentTerminIndex = 0;
  sessionVereinId = "v1";
  mailSpy.mockReset();
  alleSpy.mockReset();
});

describe("selbstEintragenMehrfachOeffentlich", () => {
  const basis = { token: "tok", name: "Anna Beispiel", rolle: "zeitnehmer", terminIds: ["t1"] };

  it("lehnt einen ungültigen Link ab und trägt nichts ein", async () => {
    vereinZuToken = null;
    const r = await selbstEintragenMehrfachOeffentlich(bereich(), formular(basis));
    expect(r).toMatchObject({ eingetragen: 0, fehler: "Ungültiger oder nicht mehr aktiver Link." });
    expect(inserts).toHaveLength(0);
  });

  it("lehnt eine Rolle ab, die zum Bereich nicht gehört (z.B. Ordner auf der Zeitnehmer-Seite)", async () => {
    const r = await selbstEintragenMehrfachOeffentlich(bereich(), formular({ ...basis, rolle: "ordner" }));
    expect(r.fehler).toBe("Bitte eine Rolle auswählen.");
    expect(inserts).toHaveLength(0);
  });

  it("verlangt Name und mindestens einen Termin", async () => {
    expect((await selbstEintragenMehrfachOeffentlich(bereich(), formular({ ...basis, name: " " }))).fehler).toBe("Name ist erforderlich.");
    expect((await selbstEintragenMehrfachOeffentlich(bereich(), formular({ token: "tok", name: "A", rolle: "zeitnehmer" }))).fehler).toBe(
      "Bitte mindestens einen Termin auswählen."
    );
  });

  it("ordnet bei exaktem Namenstreffer der Person zu und informiert sie in EINER Mail", async () => {
    const r = await selbstEintragenMehrfachOeffentlich(bereich(), formular({ ...basis, terminIds: ["t1", "t2"] }));
    expect(r).toMatchObject({ eingetragen: 2, gesamt: 2, fehler: null });
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({ userId: "u-anna", externerName: null, funktionstraegerTyp: "zeitnehmer", quelle: "selbst_eingetragen_oeffentlich" });
    expect(mailSpy).toHaveBeenCalledTimes(1);
    expect(mailSpy.mock.calls[0][0]).toBe("anna@example.test");
  });

  it("trägt einen unbekannten Namen als externe Person ein (zur Bestätigung durch den Wart), ohne Mail", async () => {
    const r = await selbstEintragenMehrfachOeffentlich(bereich(), formular({ ...basis, name: "Völlig Unbekannt" }));
    expect(r.eingetragen).toBe(1);
    expect(inserts[0]).toMatchObject({ userId: null, externerName: "Völlig Unbekannt", quelle: "selbst_eingetragen_oeffentlich" });
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("ein voll besetzter Termin verhindert die anderen nicht und löst eine Mail an den Wart aus", async () => {
    let aufruf = 0;
    const b = bereich({
      pruefeBesetzung: async () => {
        if (aufruf++ === 0) throw new Error("Bereits voll besetzt.");
      },
    });
    const r = await selbstEintragenMehrfachOeffentlich(b, formular({ ...basis, terminIds: ["t1", "t2"] }));
    expect(r.eingetragen).toBe(1);
    expect(r.gesamt).toBe(2);
    expect(r.fehler).toMatch(/Bereits voll besetzt\./);
    expect(inserts).toHaveLength(1);
    expect(alleSpy).toHaveBeenCalledTimes(1);
    expect(alleSpy.mock.calls[0][1]).toBe("Selbsteintragung fehlgeschlagen");
  });

  it("gibt die Warnung der Doppelrollen-Prüfung zurück (Ordner), ohne Warnung fehlt das Feld", async () => {
    const mit = await selbstEintragenMehrfachOeffentlich(
      bereich({ pruefeDoppelrolle: async () => ({ warnung: "Schon als Kiosk eingetragen." }) }),
      formular(basis)
    );
    expect(mit.warnung).toMatch(/Schon als Kiosk eingetragen\./);
    currentTerminIndex = 0;
    const ohne = await selbstEintragenMehrfachOeffentlich(bereich(), formular(basis));
    expect("warnung" in ohne).toBe(false);
  });

  it("eine harte Doppelrolle-Sperre wird zum Fehler dieses Termins", async () => {
    const b = bereich({
      pruefeDoppelrolle: async () => {
        throw new Error("Bereits als Zeitnehmer/Sekretär eingetragen.");
      },
    });
    const r = await selbstEintragenMehrfachOeffentlich(b, formular(basis));
    expect(r.eingetragen).toBe(0);
    expect(r.fehler).toMatch(/Bereits als Zeitnehmer\/Sekretär eingetragen\./);
    expect(inserts).toHaveLength(0);
  });
});

describe("selbstEintragenMehrfachEingeloggt", () => {
  const basis = { token: "tok", rolle: "zeitnehmer", terminIds: ["t1"] };

  it("lehnt eine Session eines anderen Vereins ab", async () => {
    sessionVereinId = "anderer-verein";
    const r = await selbstEintragenMehrfachEingeloggt(bereich(), formular(basis));
    expect(r.fehler).toBe("Ungültiger Link oder falscher Verein.");
    expect(inserts).toHaveLength(0);
    expect(rollenInserts).toHaveLength(0);
  });

  it("legt eine fehlende Rolle sofort aktiv an und trägt als selbst_angemeldet ein, ohne Mail", async () => {
    const r = await selbstEintragenMehrfachEingeloggt(bereich(), formular(basis));
    expect(r).toMatchObject({ eingetragen: 1, gesamt: 1, fehler: null });
    expect(rollenInserts[0]).toMatchObject({ userId: "u1", typ: "zeitnehmer", aktiv: true });
    expect(inserts[0]).toMatchObject({ userId: "u1", quelle: "selbst_angemeldet" });
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("legt die Rolle nicht doppelt an, wenn sie schon aktiv vorhanden ist", async () => {
    vorhandeneRolle = { id: "r1", aktiv: true };
    await selbstEintragenMehrfachEingeloggt(bereich(), formular(basis));
    expect(rollenInserts).toHaveLength(0);
    expect(inserts).toHaveLength(1);
  });
});
