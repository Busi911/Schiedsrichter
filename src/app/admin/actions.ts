"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  termine,
  users,
} from "@/db/schema";
import { parseFunktionstraegerExcel } from "@/lib/funktionstraeger-import";
import { sendMail } from "@/lib/mailer";
import { appUrl } from "@/lib/app-url";

function willkommensText(vereinName: string, email: string) {
  return [
    `Für dich wurde ein Zugang im FunktionsträgerHub von ${vereinName} angelegt.`,
    `Melde dich mit deiner E-Mail-Adresse (${email}) unter ${appUrl()}/login an — du bekommst dort einen Login-Link per E-Mail zugeschickt, ein Passwort ist nicht nötig.`,
  ].join("\n\n");
}

export async function createMannschaft(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const name = formData.get("name");
  const altersklasse = formData.get("altersklasse");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  await withTenant(vereinId, (tx) =>
    tx.insert(mannschaften).values({
      vereinId,
      name: name.trim(),
      altersklasse:
        typeof altersklasse === "string" && altersklasse.trim()
          ? altersklasse.trim()
          : null,
    })
  );

  revalidatePath("/admin/mannschaften");
}

export async function updateMannschaft(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const mannschaftId = formData.get("mannschaftId");
  const name = formData.get("name");
  const altersklasse = formData.get("altersklasse");
  if (typeof mannschaftId !== "string" || !mannschaftId) {
    throw new Error("Mannschaft fehlt.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .update(mannschaften)
      .set({
        name: name.trim(),
        altersklasse:
          typeof altersklasse === "string" && altersklasse.trim()
            ? altersklasse.trim()
            : null,
      })
      .where(
        and(eq(mannschaften.id, mannschaftId), eq(mannschaften.vereinId, vereinId))
      )
  );

  revalidatePath("/admin/mannschaften");
}

export async function deleteMannschaft(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const mannschaftId = formData.get("mannschaftId");
  if (typeof mannschaftId !== "string" || !mannschaftId) {
    throw new Error("Mannschaft fehlt.");
  }

  // Trainer-Rollen und Termine, die auf diese Mannschaft verweisen, verlieren
  // beim Löschen nur die Zuordnung (onDelete: "set null" im Schema) — sie
  // bleiben als Funktionsträger bzw. Termine erhalten.
  await withTenant(vereinId, (tx) =>
    tx
      .delete(mannschaften)
      .where(
        and(eq(mannschaften.id, mannschaftId), eq(mannschaften.vereinId, vereinId))
      )
  );

  revalidatePath("/admin/mannschaften");
}

const FUNKTIONSTRAEGER_TYPEN = [
  "schiedsrichter",
  "zeitnehmer",
  "sekretaer",
  "trainer",
  "ordner",
  "kioskdienst",
] as const;

export async function createFunktionstraeger(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const email = formData.get("email");
  const name = formData.get("name");
  const typen = formData.getAll("typen");
  const mannschaftId = formData.get("mannschaftId");
  // Checkbox: ist sie nicht angehakt, fehlt der Formularwert komplett.
  const sofortAktiv = formData.get("sofortAktiv") === "on";

  if (typeof email !== "string" || !email.trim()) {
    throw new Error("E-Mail ist erforderlich.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }
  if (
    typen.length === 0 ||
    !typen.every(
      (t): t is (typeof FUNKTIONSTRAEGER_TYPEN)[number] =>
        typeof t === "string" &&
        (FUNKTIONSTRAEGER_TYPEN as readonly string[]).includes(t)
    )
  ) {
    throw new Error("Bitte mindestens eine gültige Rolle auswählen.");
  }
  const ausgewaehlteTypen = typen as (typeof FUNKTIONSTRAEGER_TYPEN)[number][];
  const normalizedEmail = email.trim().toLowerCase();

  const vereinName = await withTenant(vereinId, async (tx) => {
    let user = await tx.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (user && user.vereinId !== vereinId) {
      throw new Error(
        "Diese E-Mail-Adresse ist bereits einem anderen Verein zugeordnet."
      );
    }

    if (!user) {
      [user] = await tx
        .insert(users)
        .values({ email: normalizedEmail, name: name.trim(), vereinId })
        .returning();
    }

    for (const typ of ausgewaehlteTypen) {
      const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
        where: and(
          eq(funktionstraegerRollen.userId, user.id),
          eq(funktionstraegerRollen.typ, typ)
        ),
      });
      if (vorhandeneRolle) continue;

      await tx.insert(funktionstraegerRollen).values({
        userId: user.id,
        typ,
        mannschaftId:
          typ === "trainer" && typeof mannschaftId === "string" && mannschaftId
            ? mannschaftId
            : null,
        aktiv: sofortAktiv,
      });
    }

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });

    return vereinRow?.name ?? "deinem Verein";
  });

  // Die Willkommens-Mail ist an "aktiv" gekoppelt, nicht an "neu angelegt":
  // ohne Login angelegte Personen bekommen die Mail erst beim späteren
  // Aktivieren (siehe funktionstraegerAktivToggeln).
  if (sofortAktiv) {
    try {
      await sendMail(
        normalizedEmail,
        "Zugang für FunktionsträgerHub",
        willkommensText(vereinName, normalizedEmail)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Statt Löschen: eine Rolle wird deaktiviert (bleibt in Zuordnungs-/
// Zuschuss-Historie erhalten), taucht aber nicht mehr in Zuordnung/
// Selbst-Anmeldung auf.
export async function funktionstraegerAktivToggeln(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const rolleId = formData.get("rolleId");
  if (typeof rolleId !== "string" || !rolleId) {
    throw new Error("Rolle fehlt.");
  }

  const aktivierung = await withTenant(vereinId, async (tx) => {
    const rolle = await tx
      .select({
        id: funktionstraegerRollen.id,
        aktiv: funktionstraegerRollen.aktiv,
        email: users.email,
      })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(eq(funktionstraegerRollen.id, rolleId), eq(users.vereinId, vereinId))
      )
      .then((r) => r[0]);
    if (!rolle) return null;

    const neuAktiv = !rolle.aktiv;
    await tx
      .update(funktionstraegerRollen)
      .set({ aktiv: neuAktiv })
      .where(eq(funktionstraegerRollen.id, rolleId));

    if (!neuAktiv) return null;

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return { email: rolle.email, vereinName: vereinRow?.name ?? "deinem Verein" };
  });

  // Beim (Wieder-)Aktivieren geht die Willkommens-Mail raus — für Personen,
  // die bewusst "ohne Login" angelegt wurden (siehe createFunktionstraeger /
  // funktionstraegerImportieren), ist das der erste Zeitpunkt, an dem sie
  // vom Zugang erfahren.
  if (aktivierung) {
    try {
      await sendMail(
        aktivierung.email,
        "Zugang für FunktionsträgerHub",
        willkommensText(aktivierung.vereinName, aktivierung.email)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

export async function funktionstraegerImportieren(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    throw new Error("Bitte eine Excel-Datei auswählen.");
  }

  const sofortAktiv = formData.get("sofortAktiv") === "on";

  const buffer = Buffer.from(await datei.arrayBuffer());
  const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);
  const fehlerListe = fehler.map((f) => `Zeile ${f.zeilenNr}: ${f.grund}`);

  let angelegt = 0;
  let uebersprungen = 0;
  const neueNutzer: { email: string }[] = [];

  const vereinName = await withTenant(vereinId, async (tx) => {
    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
    });

    for (const zeile of zeilen) {
      let user = await tx.query.users.findFirst({
        where: eq(users.email, zeile.email),
      });
      if (user && user.vereinId !== vereinId) {
        fehlerListe.push(
          `Zeile ${zeile.zeilenNr}: E-Mail bereits einem anderen Verein zugeordnet.`
        );
        continue;
      }
      if (!user) {
        [user] = await tx
          .insert(users)
          .values({ email: zeile.email, name: zeile.name, vereinId })
          .returning();
        if (sofortAktiv) neueNutzer.push({ email: user.email });
      }

      let mannschaftId: string | null = null;
      if (zeile.typ === "trainer" && zeile.mannschaftName) {
        const gefunden = mannschaftsListe.find(
          (m) => m.name.toLowerCase() === zeile.mannschaftName!.toLowerCase()
        );
        if (!gefunden) {
          fehlerListe.push(
            `Zeile ${zeile.zeilenNr}: Mannschaft "${zeile.mannschaftName}" nicht gefunden.`
          );
        } else {
          mannschaftId = gefunden.id;
        }
      }

      const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
        where: and(
          eq(funktionstraegerRollen.userId, user.id),
          eq(funktionstraegerRollen.typ, zeile.typ)
        ),
      });
      if (vorhandeneRolle) {
        uebersprungen++;
        continue;
      }

      await tx.insert(funktionstraegerRollen).values({
        userId: user.id,
        typ: zeile.typ,
        mannschaftId,
        aktiv: sofortAktiv,
      });
      angelegt++;
    }

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return vereinRow?.name ?? "deinem Verein";
  });

  for (const nutzer of neueNutzer) {
    try {
      await sendMail(
        nutzer.email,
        "Zugang für FunktionsträgerHub",
        willkommensText(vereinName, nutzer.email)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");

  const params = new URLSearchParams();
  params.set("importAngelegt", String(angelegt));
  params.set("importUebersprungen", String(uebersprungen));
  if (fehlerListe.length) params.set("importFehler", fehlerListe.join(" | "));
  redirect(`/admin/funktionstraeger?${params.toString()}`);
}

const TERMIN_TYPEN = ["testspiel", "turnier"] as const;

export async function createTermin(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const typ = formData.get("typ");
  const start = formData.get("start");
  const ende = formData.get("ende");
  const ort = formData.get("ort");
  const beschreibung = formData.get("beschreibung");
  const mannschaftId = formData.get("mannschaftId");

  if (
    typeof typ !== "string" ||
    !(TERMIN_TYPEN as readonly string[]).includes(typ)
  ) {
    throw new Error("Ungültiger Termin-Typ.");
  }
  if (typeof start !== "string" || !start) {
    throw new Error("Start ist erforderlich.");
  }

  await withTenant(vereinId, (tx) =>
    tx.insert(termine).values({
      vereinId,
      typ: typ as (typeof TERMIN_TYPEN)[number],
      start: new Date(start),
      ende: typeof ende === "string" && ende ? new Date(ende) : null,
      ort: typeof ort === "string" && ort.trim() ? ort.trim() : null,
      beschreibung:
        typeof beschreibung === "string" && beschreibung.trim()
          ? beschreibung.trim()
          : null,
      quelle: "manuell",
      erstelltVon: session.user.id,
      mannschaftId:
        typeof mannschaftId === "string" && mannschaftId
          ? mannschaftId
          : null,
      // Turniere bekommen sofort einen Freigabe-Token für die öffentliche,
      // login-freie Lese-Ansicht (/turnier/[token]).
      freigabeToken: typ === "turnier" ? crypto.randomUUID() : null,
    })
  );

  revalidatePath("/admin/termine");
}

// Bearbeiten/Löschen ist bewusst nur für manuell angelegte Termine gedacht
// (Testspiele/Turniere) — ICS-Feed-Termine werden vom Sync verwaltet und
// würden bei manueller Änderung beim nächsten Sync wieder überschrieben.
export async function updateTermin(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const typ = formData.get("typ");
  const start = formData.get("start");
  const ende = formData.get("ende");
  const ort = formData.get("ort");
  const beschreibung = formData.get("beschreibung");
  const mannschaftId = formData.get("mannschaftId");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin fehlt.");
  }
  if (
    typeof typ !== "string" ||
    !(TERMIN_TYPEN as readonly string[]).includes(typ)
  ) {
    throw new Error("Ungültiger Termin-Typ.");
  }
  if (typeof start !== "string" || !start) {
    throw new Error("Start ist erforderlich.");
  }

  await withTenant(vereinId, async (tx) => {
    const bestehend = await tx.query.termine.findFirst({
      where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)),
    });
    if (!bestehend || bestehend.quelle !== "manuell") {
      throw new Error("Termin nicht gefunden oder nicht bearbeitbar.");
    }

    await tx
      .update(termine)
      .set({
        typ: typ as (typeof TERMIN_TYPEN)[number],
        start: new Date(start),
        ende: typeof ende === "string" && ende ? new Date(ende) : null,
        ort: typeof ort === "string" && ort.trim() ? ort.trim() : null,
        beschreibung:
          typeof beschreibung === "string" && beschreibung.trim()
            ? beschreibung.trim()
            : null,
        mannschaftId:
          typeof mannschaftId === "string" && mannschaftId
            ? mannschaftId
            : null,
      })
      .where(eq(termine.id, terminId));
  });

  revalidatePath("/admin/termine");
  redirect("/admin/termine");
}

export async function deleteTermin(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    const bestehend = await tx.query.termine.findFirst({
      where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)),
    });
    if (!bestehend || bestehend.quelle !== "manuell") {
      throw new Error("Termin nicht gefunden oder nicht löschbar.");
    }
    // Einzelspiele eines Turniers hängen per ON DELETE CASCADE an
    // turnier_id und werden hier automatisch mitgelöscht.
    await tx.delete(termine).where(eq(termine.id, terminId));
  });

  revalidatePath("/admin/termine");
  redirect("/admin/termine");
}

// ---------------------------------------------------------------------------
// Turnier-Spielplan: einzelne Spiele innerhalb eines Turnier-Containers
// (termine.typ = "turnier"). Dienste-Bedarf (Ordner/Kiosk) gilt weiterhin
// nur für den Container, nicht für jedes Einzelspiel — die brauchen aber
// jeweils eigene Schiri-/Zeitnehmer-/Sekretär-Zuordnung.
// ---------------------------------------------------------------------------

async function ladeTurnierContainer(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  turnierId: string,
  vereinId: string
) {
  const turnier = await tx.query.termine.findFirst({
    where: and(
      eq(termine.id, turnierId),
      eq(termine.vereinId, vereinId),
      eq(termine.typ, "turnier")
    ),
  });
  if (!turnier) throw new Error("Turnier nicht gefunden.");
  return turnier;
}

export async function createTurnierSpiel(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const turnierId = formData.get("turnierId");
  const start = formData.get("start");
  const ende = formData.get("ende");
  const ort = formData.get("ort");
  const beschreibung = formData.get("beschreibung");

  if (typeof turnierId !== "string" || !turnierId) {
    throw new Error("Turnier fehlt.");
  }
  if (typeof start !== "string" || !start) {
    throw new Error("Start ist erforderlich.");
  }

  await withTenant(vereinId, async (tx) => {
    await ladeTurnierContainer(tx, turnierId, vereinId);

    await tx.insert(termine).values({
      vereinId,
      typ: "turnier_spiel",
      turnierId,
      start: new Date(start),
      ende: typeof ende === "string" && ende ? new Date(ende) : null,
      ort: typeof ort === "string" && ort.trim() ? ort.trim() : null,
      beschreibung:
        typeof beschreibung === "string" && beschreibung.trim()
          ? beschreibung.trim()
          : null,
      quelle: "manuell",
      erstelltVon: session.user.id,
    });
  });

  revalidatePath(`/admin/termine/${turnierId}`);
}

export async function updateTurnierSpiel(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const turnierId = formData.get("turnierId");
  const start = formData.get("start");
  const ende = formData.get("ende");
  const ort = formData.get("ort");
  const beschreibung = formData.get("beschreibung");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Spiel fehlt.");
  }
  if (typeof turnierId !== "string" || !turnierId) {
    throw new Error("Turnier fehlt.");
  }
  if (typeof start !== "string" || !start) {
    throw new Error("Start ist erforderlich.");
  }

  await withTenant(vereinId, async (tx) => {
    const bestehend = await tx.query.termine.findFirst({
      where: and(
        eq(termine.id, terminId),
        eq(termine.vereinId, vereinId),
        eq(termine.typ, "turnier_spiel"),
        eq(termine.turnierId, turnierId)
      ),
    });
    if (!bestehend) throw new Error("Spiel nicht gefunden.");

    await tx
      .update(termine)
      .set({
        start: new Date(start),
        ende: typeof ende === "string" && ende ? new Date(ende) : null,
        ort: typeof ort === "string" && ort.trim() ? ort.trim() : null,
        beschreibung:
          typeof beschreibung === "string" && beschreibung.trim()
            ? beschreibung.trim()
            : null,
      })
      .where(eq(termine.id, terminId));
  });

  revalidatePath(`/admin/termine/${turnierId}`);
}

export async function deleteTurnierSpiel(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const turnierId = formData.get("turnierId");
  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Spiel fehlt.");
  }
  if (typeof turnierId !== "string" || !turnierId) {
    throw new Error("Turnier fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    await tx
      .delete(termine)
      .where(
        and(
          eq(termine.id, terminId),
          eq(termine.vereinId, vereinId),
          eq(termine.typ, "turnier_spiel"),
          eq(termine.turnierId, turnierId)
        )
      );
  });

  revalidatePath(`/admin/termine/${turnierId}`);
}

export async function turnierLinkErneuern(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const turnierId = formData.get("turnierId");
  if (typeof turnierId !== "string" || !turnierId) {
    throw new Error("Turnier fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    await ladeTurnierContainer(tx, turnierId, vereinId);
    await tx
      .update(termine)
      .set({ freigabeToken: crypto.randomUUID() })
      .where(eq(termine.id, turnierId));
  });

  revalidatePath(`/admin/termine/${turnierId}`);
}
