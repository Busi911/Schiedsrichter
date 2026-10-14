"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { dienstArten, dienstArtMannschaften, mannschaften, terminZuordnungen, vereine } from "@/db/schema";
import { pruefeBedarf, pruefeDienstName } from "@/lib/eigene-dienste";
import { pflegeAuswaertsTermine } from "@/lib/auswaerts-termine";

// Einstellungen → "Eigene Dienste" (Fahrer, Kuchen, ...). Regeln in lib/eigene-dienste.ts.

function text(formData: FormData, feld: string): string {
  const wert = formData.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

function aktualisiereSeiten() {
  revalidatePath("/admin/einstellungen");
  revalidatePath("/admin");
  revalidatePath("/admin/kalender");
  revalidatePath("/admin/dienste");
  revalidatePath("/profil/dienstwart");
}

// Auswärtsspiele hängen an den Diensten (lib/auswaerts-termine.ts): nach jeder Änderung gleich anlegen bzw. aufräumen, statt bis zum
// nächsten stündlichen Übernahme-Cron zu warten. Wie der Cron nur bei eingeschalteter Liga-Übernahme; nach der Antwort, Fehler still.
function pflegeAuswaertsNachAenderung(vereinId: string) {
  after(async () => {
    try {
      const v = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { ligaUebernahmeAktiv: true } });
      if (v?.ligaUebernahmeAktiv) await pflegeAuswaertsTermine(vereinId);
    } catch (err) {
      console.error("Auswärtsspiele konnten nicht aktualisiert werden:", err);
    }
  });
}

// Bedarf je Veranstaltung aus dem gemeinsamen Formular (components/dienste-einstellungen.tsx). Feste Dienste haben kein Auswärts-Feld.
function leseBedarf(formData: FormData, mitAuswaerts: boolean) {
  return {
    bedarfHeim: pruefeBedarf(text(formData, "bedarfHeim")),
    bedarfAuswaerts: mitAuswaerts ? pruefeBedarf(text(formData, "bedarfAuswaerts")) : 0,
    bedarfFreundschaft: pruefeBedarf(text(formData, "bedarfFreundschaft")),
    bedarfTurnier: pruefeBedarf(text(formData, "bedarfTurnier")),
  };
}

// Feste Dienste (Ordner, Kioskdienst, Kassierer, Zeitnehmer/Sekretär) im selben Formular wie die eigenen: Bedarf je Veranstaltung
// (vereine.<veranstaltung><Rolle>Bedarf) und Mannschaften (mannschaft.<rolle>BedarfDeaktiviert, dieselben Schalter wie auf den
// Wart-Seiten; "nur diese" schaltet alle anderen Mannschaften ab).
const FESTE_ROLLEN = {
  ordner: { feld: "Ordner", deaktiviert: "ordnerBedarfDeaktiviert" },
  kioskdienst: { feld: "Kioskdienst", deaktiviert: "kioskdienstBedarfDeaktiviert" },
  kassierer: { feld: "Kassierer", deaktiviert: "kassiererBedarfDeaktiviert" },
  zeitnehmer: { feld: "Zeitnehmer", deaktiviert: "zeitnehmerBedarfDeaktiviert" },
} as const;

export async function festenDienstSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const rolle = text(formData, "rolle");
  if (!(rolle in FESTE_ROLLEN)) throw new Error("Unbekannter Dienst.");
  const { feld, deaktiviert } = FESTE_ROLLEN[rolle as keyof typeof FESTE_ROLLEN];
  const bedarf = leseBedarf(formData, false);
  const nurAuswahl = formData.get("mannschaftsModus") === "auswahl";
  const gewaehlt = new Set(formData.getAll("mannschaftIds").filter((m): m is string => typeof m === "string" && !!m));

  await withTenant(vereinId, async (tx) => {
    await tx
      .update(vereine)
      .set({
        [`rundenspiel${feld}Bedarf`]: bedarf.bedarfHeim,
        [`testspiel${feld}Bedarf`]: bedarf.bedarfFreundschaft,
        [`turnier${feld}Bedarf`]: bedarf.bedarfTurnier,
      })
      .where(eq(vereine.id, vereinId));
    const liste = await tx.select({ id: mannschaften.id }).from(mannschaften).where(eq(mannschaften.vereinId, vereinId));
    if (nurAuswahl && !liste.some((m) => gewaehlt.has(m.id))) {
      throw new Error("Bitte mindestens eine Mannschaft auswählen oder „alle Mannschaften“ wählen.");
    }
    for (const m of liste) {
      await tx
        .update(mannschaften)
        .set({ [deaktiviert]: nurAuswahl && !gewaehlt.has(m.id) })
        .where(and(eq(mannschaften.id, m.id), eq(mannschaften.vereinId, vereinId)));
    }
  });
  aktualisiereSeiten();
  revalidatePath("/admin/mannschaften");
  revalidatePath("/profil/ordnerwart");
  revalidatePath("/profil/zeitnehmerwart");
}

// Neu anlegen (ohne id) oder ändern (mit id).
export async function dienstArtSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id") || null;

  const beschreibung = text(formData, "beschreibung").slice(0, 300) || null;
  const bedarf = leseBedarf(formData, true);
  const nurAusgewaehlteMannschaften = formData.get("mannschaftsModus") === "auswahl";
  const gewaehlteMannschaften = formData.getAll("mannschaftIds").filter((m): m is string => typeof m === "string" && !!m);
  if (bedarf.bedarfHeim + bedarf.bedarfAuswaerts + bedarf.bedarfFreundschaft + bedarf.bedarfTurnier === 0) {
    throw new Error("Bitte bei mindestens einer Veranstaltung einen Bedarf eintragen.");
  }

  await withTenant(vereinId, async (tx) => {
    const andere = await tx
      .select({ name: dienstArten.name })
      .from(dienstArten)
      .where(id ? and(eq(dienstArten.vereinId, vereinId), ne(dienstArten.id, id)) : eq(dienstArten.vereinId, vereinId));
    const name = pruefeDienstName(text(formData, "name"), andere.map((a) => a.name));

    // Nur Mannschaften dieses Vereins übernehmen (RLS + ausdrücklicher Filter).
    const mannschaftIds = gewaehlteMannschaften.length
      ? (
          await tx
            .select({ id: mannschaften.id })
            .from(mannschaften)
            .where(and(eq(mannschaften.vereinId, vereinId), inArray(mannschaften.id, gewaehlteMannschaften)))
        ).map((m) => m.id)
      : [];
    if (nurAusgewaehlteMannschaften && mannschaftIds.length === 0) {
      throw new Error("Bitte mindestens eine Mannschaft auswählen oder „alle Mannschaften“ wählen.");
    }

    const werte = { name, beschreibung, nurAusgewaehlteMannschaften, ...bedarf };
    let dienstArtId = id;
    if (id) {
      const [geaendert] = await tx
        .update(dienstArten)
        .set(werte)
        .where(and(eq(dienstArten.id, id), eq(dienstArten.vereinId, vereinId)))
        .returning({ id: dienstArten.id });
      if (!geaendert) throw new Error("Dienst nicht gefunden.");
    } else {
      const [{ anzahl }] = await tx.select({ anzahl: count() }).from(dienstArten).where(eq(dienstArten.vereinId, vereinId));
      if (anzahl >= 20) throw new Error("Es sind höchstens 20 eigene Dienste möglich.");
      const [neu] = await tx
        .insert(dienstArten)
        .values({ vereinId, ...werte, reihenfolge: anzahl })
        .returning({ id: dienstArten.id });
      dienstArtId = neu.id;
    }

    await tx
      .delete(dienstArtMannschaften)
      .where(and(eq(dienstArtMannschaften.dienstArtId, dienstArtId!), eq(dienstArtMannschaften.vereinId, vereinId)));
    if (nurAusgewaehlteMannschaften) {
      await tx
        .insert(dienstArtMannschaften)
        .values(mannschaftIds.map((mannschaftId) => ({ dienstArtId: dienstArtId!, mannschaftId, vereinId })));
    }
  });

  aktualisiereSeiten();
  pflegeAuswaertsNachAenderung(vereinId);
}

// Deaktivieren statt löschen, sobald ein Dienst schon eingeteilt wurde: die Einteilungen bleiben sichtbar, es entsteht kein neuer Bedarf.
export async function dienstArtAktivSetzen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id");
  const aktiv = formData.get("aktiv") === "true";
  await withTenant(vereinId, (tx) =>
    tx.update(dienstArten).set({ aktiv }).where(and(eq(dienstArten.id, id), eq(dienstArten.vereinId, vereinId)))
  );
  aktualisiereSeiten();
  pflegeAuswaertsNachAenderung(vereinId);
}

// Löschen nur, solange niemand für den Dienst eingeteilt ist (sonst gingen die Einteilungen mit verloren).
export async function dienstArtLoeschen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id");
  await withTenant(vereinId, async (tx) => {
    const [{ anzahl }] = await tx
      .select({ anzahl: count() })
      .from(terminZuordnungen)
      .where(eq(terminZuordnungen.dienstArtId, id));
    if (anzahl > 0) {
      throw new Error("Für diesen Dienst sind schon Personen eingeteilt. Bitte deaktivieren statt löschen, damit die Einteilungen erhalten bleiben.");
    }
    await tx.delete(dienstArten).where(and(eq(dienstArten.id, id), eq(dienstArten.vereinId, vereinId)));
  });
  aktualisiereSeiten();
  pflegeAuswaertsNachAenderung(vereinId);
}
