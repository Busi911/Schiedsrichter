import { beforeEach, describe, expect, it, vi } from "vitest";

// Die Registrierung prüft zuerst, ob es den Verein (egal in welchem Zustand) schon gibt: nichts wird still doppelt angelegt.
const mocks = vi.hoisted(() => ({
  legeVereinMitAdminAn: vi.fn(async () => "neue-id"),
  findeAehnlicheVereine: vi.fn(async (): Promise<{ id: string; name: string; zustand: "aktiv" | "vorbereitung" | "inaktiv" }[]> => []),
  registrierungMail: vi.fn(async () => {}),
  anfrageMail: vi.fn(async () => {}),
  sendMail: vi.fn(async () => {}),
}));

vi.stubEnv("APP_URL", "https://example.test");
vi.mock("@/lib/system-einstellungen", () => ({ holeBetaStand: async () => ({ frei: 3, voll: false }) }));
vi.mock("@/lib/verein-anlegen", () => ({ legeVereinMitAdminAn: mocks.legeVereinMitAdminAn }));
vi.mock("@/lib/verein-duplikat-daten", () => ({ findeAehnlicheVereine: mocks.findeAehnlicheVereine }));
vi.mock("@/lib/mailer", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/system-admin-benachrichtigung", () => ({
  benachrichtigeSystemAdminsUeberRegistrierung: mocks.registrierungMail,
  benachrichtigeSystemAdminsUeberUebernahmeAnfrage: mocks.anfrageMail,
}));

function formular(extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    vereinsname: " HSG Dutenhofen ",
    adminName: "Anna",
    adminEmail: "Anna@Example.de ",
    strasse: "Hauptstr. 1",
    plz: "35000",
    ort: "Wetzlar",
    ...extra,
  })) {
    f.set(k, v);
  }
  return f;
}

const treffer = [{ id: "v1", name: "HSG Dutenhofen/Münchholzhausen", zustand: "aktiv" as const }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findeAehnlicheVereine.mockResolvedValue([]);
});

describe("vereinRegistrieren", () => {
  it("ohne ähnlichen Verein: wie bisher anlegen", async () => {
    const { vereinRegistrieren } = await import("./actions");
    const r = await vereinRegistrieren(formular());
    expect(r).toEqual({ ergebnis: "registriert", kostenpflichtig: false });
    expect(mocks.legeVereinMitAdminAn).toHaveBeenCalledTimes(1);
    expect(mocks.registrierungMail).toHaveBeenCalledWith("HSG Dutenhofen", "Anna", "anna@example.de", []);
  });

  it("mit ähnlichem Verein und ohne Entscheidung: nichts anlegen, nur zurückfragen (Werte kommen zurück, kein gespeicherter Name)", async () => {
    mocks.findeAehnlicheVereine.mockResolvedValue(treffer);
    const { vereinRegistrieren } = await import("./actions");
    const r = await vereinRegistrieren(formular());
    expect(r).toMatchObject({ ergebnis: "aehnlich", werte: { vereinsname: "HSG Dutenhofen", adminName: "Anna", plz: "35000" } });
    expect(JSON.stringify(r)).not.toContain("Münchholzhausen");
    expect(mocks.legeVereinMitAdminAn).not.toHaveBeenCalled();
    expect(mocks.anfrageMail).not.toHaveBeenCalled();
    expect(mocks.registrierungMail).not.toHaveBeenCalled();
  });

  it("\"Das ist unser Verein\": kein zweiter Verein, die Systemadmins bekommen die Anfrage", async () => {
    mocks.findeAehnlicheVereine.mockResolvedValue(treffer);
    const { vereinRegistrieren } = await import("./actions");
    const r = await vereinRegistrieren(formular({ entscheidung: "derselbe" }));
    expect(r).toEqual({ ergebnis: "anfrage_gesendet" });
    expect(mocks.legeVereinMitAdminAn).not.toHaveBeenCalled();
    expect(mocks.anfrageMail).toHaveBeenCalledWith("HSG Dutenhofen", "Anna", "anna@example.de", treffer);
  });

  it("\"Ein anderer Verein\": wird angelegt, die Systemadmins sehen den ähnlichen Namen", async () => {
    mocks.findeAehnlicheVereine.mockResolvedValue(treffer);
    const { vereinRegistrieren } = await import("./actions");
    const r = await vereinRegistrieren(formular({ entscheidung: "anderer" }));
    expect(r).toEqual({ ergebnis: "registriert", kostenpflichtig: false });
    expect(mocks.legeVereinMitAdminAn).toHaveBeenCalledTimes(1);
    expect(mocks.registrierungMail).toHaveBeenCalledWith("HSG Dutenhofen", "Anna", "anna@example.de", treffer);
  });

  it("\"Das ist unser Verein\" ohne Treffer legt normal an (kein Umweg über die Anfrage)", async () => {
    const { vereinRegistrieren } = await import("./actions");
    const r = await vereinRegistrieren(formular({ entscheidung: "derselbe" }));
    expect(r).toMatchObject({ ergebnis: "registriert" });
    expect(mocks.anfrageMail).not.toHaveBeenCalled();
  });

  it("ungültige E-Mail bei der Anfrage wird abgelehnt", async () => {
    mocks.findeAehnlicheVereine.mockResolvedValue(treffer);
    const { vereinRegistrieren } = await import("./actions");
    const r = await vereinRegistrieren(formular({ entscheidung: "derselbe", adminEmail: "keine-mail" }));
    expect(r).toEqual({ fehler: "Die E-Mail-Adresse ist ungültig." });
    expect(mocks.anfrageMail).not.toHaveBeenCalled();
  });
});
