"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { requireAdmin, requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  termine,
  terminZuordnungen,
  users,
} from "@/db/schema";
import { parseFunktionstraegerExcel } from "@/lib/funktionstraeger-import";
import { normalisiereMannschaftsname } from "@/lib/rundenspiel-import";
import { sendMail } from "@/lib/mailer";
import { appUrl } from "@/lib/app-url";
import { parseBerlinDatumZeit } from "@/lib/format";
import { istTurnierBerechtigt } from "@/lib/turnier-zugriff";

function willkommensText(vereinName: string, email: string) {
  return [
    `Für dich wurde ein Zugang im HandballerPate von ${vereinName} angelegt.`,
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
  "schiedsrichterwart",
  "zeitnehmerwart",
  "ordnerwart",
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
  const alsAdmin = formData.get("istAdmin") === "on";

  if (typeof email !== "string" || !email.trim()) {
    throw new Error("E-Mail ist erforderlich.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }
  if (
    !typen.every(
      (t): t is (typeof FUNKTIONSTRAEGER_TYPEN)[number] =>
        typeof t === "string" &&
        (FUNKTIONSTRAEGER_TYPEN as readonly string[]).includes(t)
    )
  ) {
    throw new Error("Ungültige Rolle ausgewählt.");
  }
  // Admin zählt als eigenständige "Rolle" für die Mindestanforderung — eine
  // Person kann bewusst NUR Admin sein, ohne aktiven Funktionsträger-Typ
  // (z.B. ein Vorstandsmitglied ohne eigenen Dienst).
  if (typen.length === 0 && !alsAdmin) {
    throw new Error("Bitte mindestens eine Rolle auswählen (oder Admin).");
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
        .values({
          email: normalizedEmail,
          name: name.trim(),
          vereinId,
          istAdmin: alsAdmin,
        })
        .returning();
    } else if (alsAdmin && !user.istAdmin) {
      // Nur BEFÖRDERN, nie hier degradieren — dieses Formular dient auch
      // dazu, einer bestehenden Person eine weitere Rolle zu ergänzen, ohne
      // versehentlich ihre Admin-Rechte zu entziehen, wenn die Checkbox beim
      // erneuten Absenden nicht angehakt ist (siehe adminRechteToggeln für
      // die bewusste Degradierung).
      await tx
        .update(users)
        .set({ istAdmin: true })
        .where(eq(users.id, user.id));
      user = { ...user, istAdmin: true };
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
        "Zugang für HandballerPate",
        willkommensText(vereinName, normalizedEmail)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Statt Löschen: eine Rolle wird deaktiviert (bleibt in der
// Zuordnungs-Historie erhalten), taucht aber nicht mehr in Zuordnung/
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
        "Zugang für HandballerPate",
        willkommensText(aktivierung.vereinName, aktivierung.email)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

function emailGeaendertText(vereinName: string, neueEmail: string, istNeueAdresse: boolean) {
  if (istNeueAdresse) {
    return [
      `Deine E-Mail-Adresse im HandballerPate von ${vereinName} wurde auf diese Adresse geändert.`,
      `Du kannst dich ab sofort mit ${neueEmail} unter ${appUrl()}/login einloggen.`,
    ].join("\n\n");
  }
  return [
    `Deine E-Mail-Adresse im HandballerPate von ${vereinName} wurde geändert — dein Zugang läuft jetzt über ${neueEmail}.`,
    `Falls das nicht du warst bzw. dir diese Änderung nicht bekannt vorkommt, melde dich bitte beim Vereinsadmin.`,
  ].join("\n\n");
}

// Name/E-Mail einer bestehenden Person bearbeiten. Bei E-Mail-Änderung geht
// eine Info sowohl an die neue als auch an die alte Adresse raus, damit ein
// versehentlicher/unbefugter Wechsel auffällt.
export async function updateFunktionstraeger(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const userId = formData.get("userId");
  const name = formData.get("name");
  const email = formData.get("email");

  if (typeof userId !== "string" || !userId) {
    throw new Error("Person fehlt.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }
  if (typeof email !== "string" || !email.trim()) {
    throw new Error("E-Mail ist erforderlich.");
  }
  const neueEmail = email.trim().toLowerCase();

  const ergebnis = await withTenant(vereinId, async (tx) => {
    const bestehend = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!bestehend) throw new Error("Person nicht gefunden.");

    if (neueEmail !== bestehend.email) {
      const belegt = await tx.query.users.findFirst({
        where: eq(users.email, neueEmail),
      });
      if (belegt) {
        throw new Error(
          "Diese E-Mail-Adresse wird bereits von einem anderen Zugang verwendet."
        );
      }
    }

    const alteEmail = bestehend.email;
    await tx
      .update(users)
      .set({ name: name.trim(), email: neueEmail })
      .where(eq(users.id, userId));

    if (neueEmail === alteEmail) return null;

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return { alteEmail, neueEmail, vereinName: vereinRow?.name ?? "deinem Verein" };
  });

  if (ergebnis) {
    try {
      await sendMail(
        ergebnis.neueEmail,
        "E-Mail-Adresse geändert",
        emailGeaendertText(ergebnis.vereinName, ergebnis.neueEmail, true)
      );
    } catch (err) {
      console.error("Info-Mail an neue Adresse fehlgeschlagen:", err);
    }
    try {
      await sendMail(
        ergebnis.alteEmail,
        "E-Mail-Adresse geändert",
        emailGeaendertText(ergebnis.vereinName, ergebnis.neueEmail, false)
      );
    } catch (err) {
      console.error("Info-Mail an alte Adresse fehlgeschlagen:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Admin-Rechte für eine bestehende Person umschalten. "users" hat bewusst
// KEIN RLS (siehe 0001_enable_rls_multi_tenant.sql) — die Zugehörigkeit zum
// eigenen Verein muss deshalb hier explizit geprüft werden, sonst ließe
// sich über eine manipulierte userId einer Person eines FREMDEN Vereins
// Admin-Rechte erteilen. Selbst-Degradierung ist bewusst gesperrt: sonst
// könnte sich ein Admin (z.B. versehentlich) aus dem eigenen Admin-Bereich
// aussperren, ohne dass ein anderer Admin/Systemadmin eingreifen kann,
// falls es der einzige Admin des Vereins war.
export async function adminRechteToggeln(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) {
    throw new Error("Person fehlt.");
  }
  if (userId === session.user.id) {
    throw new Error(
      "Du kannst dir hier nicht selbst die Admin-Rechte entziehen — das muss ein anderer Admin für dich tun."
    );
  }

  await withTenant(vereinId, async (tx) => {
    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!person) throw new Error("Person nicht gefunden.");

    await tx
      .update(users)
      .set({ istAdmin: !person.istAdmin })
      .where(eq(users.id, userId));
  });

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
        "Zugang für HandballerPate",
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
      start: parseBerlinDatumZeit(start),
      ende: typeof ende === "string" && ende ? parseBerlinDatumZeit(ende) : null,
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

// Geteilte Kernlogik zwischen updateTermin (dedizierte Bearbeiten-Seite,
// springt danach zur Liste zurück) und updateTerminInline (Schnell-Bearbeiten
// direkt im Kalender-Modal, bleibt auf der Kalenderseite) — beide validieren/
// speichern identisch, unterscheiden sich nur im Verhalten NACH dem Speichern.
async function aktualisiereTerminFelder(
  session: Awaited<ReturnType<typeof requireAdmin>>,
  formData: FormData
) {
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const typ = formData.get("typ");
  const start = formData.get("start");
  const ende = formData.get("ende");
  const ort = formData.get("ort");
  const beschreibung = formData.get("beschreibung");
  const mannschaftId = formData.get("mannschaftId");
  const turnierVerantwortlicherId = formData.get("turnierVerantwortlicherId");

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

    // turnierVerantwortlicherId kommt roh aus dem Formular (Dropdown zeigt
    // zwar nur aktive Trainer, ein manipulierter Request könnte aber eine
    // beliebige userId schicken). "user" hat bewusst KEIN RLS (siehe
    // 0001_enable_rls_multi_tenant.sql) — die Prüfung läuft daher über
    // funktionstraeger_rolle, das per RLS ohnehin nur Zeilen des eigenen
    // Vereins zeigt: kein Treffer heißt automatisch "fremder Verein oder
    // kein aktiver Trainer", beides soll verworfen statt gespeichert werden.
    let geprueftesVerantwortlicherId: string | null = null;
    if (
      typ === "turnier" &&
      typeof turnierVerantwortlicherId === "string" &&
      turnierVerantwortlicherId
    ) {
      const istAktiverTrainer = await tx.query.funktionstraegerRollen.findFirst({
        where: and(
          eq(funktionstraegerRollen.userId, turnierVerantwortlicherId),
          eq(funktionstraegerRollen.typ, "trainer"),
          eq(funktionstraegerRollen.aktiv, true)
        ),
      });
      if (istAktiverTrainer) geprueftesVerantwortlicherId = turnierVerantwortlicherId;
    }

    await tx
      .update(termine)
      .set({
        typ: typ as (typeof TERMIN_TYPEN)[number],
        start: parseBerlinDatumZeit(start),
        ende: typeof ende === "string" && ende ? parseBerlinDatumZeit(ende) : null,
        ort: typeof ort === "string" && ort.trim() ? ort.trim() : null,
        beschreibung:
          typeof beschreibung === "string" && beschreibung.trim()
            ? beschreibung.trim()
            : null,
        mannschaftId:
          typeof mannschaftId === "string" && mannschaftId
            ? mannschaftId
            : null,
        // Nur beim Turnier-Container relevant — bei einer Typänderung weg
        // vom Turnier (z.B. zurück zu Freundschaftsspiel) wird es mit
        // zurückgesetzt, damit kein "verwaister" Verantwortlicher übrig
        // bleibt, der dann nichts mehr zu verwalten hätte.
        turnierVerantwortlicherId: geprueftesVerantwortlicherId,
      })
      .where(eq(termine.id, terminId));
  });

  return { terminId, typ };
}

// Bearbeiten/Löschen ist bewusst nur für manuell angelegte Termine gedacht
// (Testspiele/Turniere) — ICS-Feed-Termine werden vom Sync verwaltet und
// würden bei manueller Änderung beim nächsten Sync wieder überschrieben.
export async function updateTermin(formData: FormData) {
  const session = await requireAdmin();
  await aktualisiereTerminFelder(session, formData);

  revalidatePath("/admin/termine");
  redirect("/admin/termine");
}

// Schnell-Bearbeiten direkt im Kalender-Modal (siehe MonatsKalender-Balken)
// — bewusst OHNE redirect, damit der Admin auf der Kalenderseite bleibt
// statt zur Termine-Liste zu springen.
export async function updateTerminInline(formData: FormData) {
  const session = await requireAdmin();
  await aktualisiereTerminFelder(session, formData);

  revalidatePath("/admin/kalender");
  revalidatePath("/admin/termine");
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

// Verknüpft ein manuell angelegtes Freundschaftsspiel (typ "testspiel") mit
// dem später offiziell über den Hallenspielplan importierten Rundenspiel,
// das sich als Duplikat herausgestellt hat (siehe findeTestspielDuplikate).
// Statt das Freundschaftsspiel einfach zu löschen (und damit bereits
// erfasste Zuordnungen wie Schiedsrichter/Zeitnehmer/Sekretär zu verlieren,
// die per ON DELETE CASCADE an termin_id hängen), werden diese zuerst auf
// das Rundenspiel übertragen. Bereits am Rundenspiel vorhandene, inhaltlich
// identische Zuordnungen (gleiche Rolle + gleiche Person) werden dabei
// verworfen statt dupliziert.
export async function testspielDuplikatVerknuepfen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const testspielId = formData.get("testspielId");
  const rundenspielId = formData.get("rundenspielId");
  if (
    typeof testspielId !== "string" ||
    !testspielId ||
    typeof rundenspielId !== "string" ||
    !rundenspielId
  ) {
    throw new Error("Termine fehlen.");
  }

  await withTenant(vereinId, async (tx) => {
    const [testspiel, rundenspiel] = await Promise.all([
      tx.query.termine.findFirst({
        where: and(eq(termine.id, testspielId), eq(termine.vereinId, vereinId)),
      }),
      tx.query.termine.findFirst({
        where: and(eq(termine.id, rundenspielId), eq(termine.vereinId, vereinId)),
      }),
    ]);
    if (
      !testspiel ||
      testspiel.quelle !== "manuell" ||
      testspiel.typ !== "testspiel" ||
      !rundenspiel ||
      rundenspiel.typ !== "rundenspiel"
    ) {
      throw new Error("Termine nicht gefunden oder nicht verknüpfbar.");
    }

    const [bestehendeZuordnungen, testspielZuordnungen] = await Promise.all([
      tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.terminId, rundenspielId),
      }),
      tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.terminId, testspielId),
      }),
    ]);

    for (const z of testspielZuordnungen) {
      const bereitsVorhanden = bestehendeZuordnungen.some(
        (b) =>
          b.funktionstraegerTyp === z.funktionstraegerTyp &&
          b.userId === z.userId &&
          b.externerName === z.externerName
      );
      if (bereitsVorhanden) {
        await tx.delete(terminZuordnungen).where(eq(terminZuordnungen.id, z.id));
      } else {
        await tx
          .update(terminZuordnungen)
          .set({ terminId: rundenspielId })
          .where(eq(terminZuordnungen.id, z.id));
      }
    }

    await tx.delete(termine).where(eq(termine.id, testspielId));
  });

  revalidatePath("/admin/rundenspiele");
}

// ---------------------------------------------------------------------------
// Turnier-Spielplan: einzelne Spiele innerhalb eines Turnier-Containers
// (termine.typ = "turnier"). Dienste-Bedarf (Ordner/Kiosk) gilt weiterhin
// nur für den Container, nicht für jedes Einzelspiel — die brauchen aber
// jeweils eigene Schiri-/Zeitnehmer-/Sekretär-Zuordnung.
// ---------------------------------------------------------------------------

// Zugriff auf einen Turnier-Container: Vereinsadmin ODER der für GENAU
// dieses Turnier benannte Turnierverantwortliche (siehe istTurnierBerechtigt/
// requireSession statt requireAdmin in den untenstehenden Aktionen).
async function ladeTurnierContainer(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  turnierId: string,
  vereinId: string,
  session: { user: { id: string; istAdmin: boolean } }
) {
  const turnier = await tx.query.termine.findFirst({
    where: and(
      eq(termine.id, turnierId),
      eq(termine.vereinId, vereinId),
      eq(termine.typ, "turnier")
    ),
  });
  if (!turnier) throw new Error("Turnier nicht gefunden.");
  if (!istTurnierBerechtigt(turnier, session)) {
    throw new Error("Keine Berechtigung für dieses Turnier.");
  }
  return turnier;
}

function parseErgebnisWert(wert: FormDataEntryValue | null): number | null {
  if (typeof wert !== "string" || !wert.trim()) return null;
  const zahl = Number.parseInt(wert, 10);
  return Number.isFinite(zahl) ? zahl : null;
}

export async function createTurnierSpiel(formData: FormData) {
  const session = await requireSession();
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
    await ladeTurnierContainer(tx, turnierId, vereinId, session);

    await tx.insert(termine).values({
      vereinId,
      typ: "turnier_spiel",
      turnierId,
      start: parseBerlinDatumZeit(start),
      ende: typeof ende === "string" && ende ? parseBerlinDatumZeit(ende) : null,
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
  const session = await requireSession();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const turnierId = formData.get("turnierId");
  const start = formData.get("start");
  const ende = formData.get("ende");
  const ort = formData.get("ort");
  const beschreibung = formData.get("beschreibung");
  const ergebnisHeim = formData.get("ergebnisHeim");
  const ergebnisAuswaerts = formData.get("ergebnisAuswaerts");

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
    await ladeTurnierContainer(tx, turnierId, vereinId, session);

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
        start: parseBerlinDatumZeit(start),
        ende: typeof ende === "string" && ende ? parseBerlinDatumZeit(ende) : null,
        ort: typeof ort === "string" && ort.trim() ? ort.trim() : null,
        beschreibung:
          typeof beschreibung === "string" && beschreibung.trim()
            ? beschreibung.trim()
            : null,
        ergebnisHeim: parseErgebnisWert(ergebnisHeim),
        ergebnisAuswaerts: parseErgebnisWert(ergebnisAuswaerts),
      })
      .where(eq(termine.id, terminId));
  });

  revalidatePath(`/admin/termine/${turnierId}`);
  revalidatePath(`/profil/turnier/${turnierId}`);
}

export async function deleteTurnierSpiel(formData: FormData) {
  const session = await requireSession();
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
    await ladeTurnierContainer(tx, turnierId, vereinId, session);

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
  revalidatePath(`/profil/turnier/${turnierId}`);
}

export async function turnierLinkErneuern(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const turnierId = formData.get("turnierId");
  if (typeof turnierId !== "string" || !turnierId) {
    throw new Error("Turnier fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    await ladeTurnierContainer(tx, turnierId, vereinId, session);
    await tx
      .update(termine)
      .set({ freigabeToken: crypto.randomUUID() })
      .where(eq(termine.id, turnierId));
  });

  revalidatePath(`/admin/termine/${turnierId}`);
}

export async function mannschaftAusRundenspielAnlegen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name fehlt.");
  }
  const kategorieRoh = formData.get("kategorie");
  // "" statt null, wenn das Formularfeld leer war (kein Unterschied zu
  // "kein Kategorie-Feld vorhanden") — beides bedeutet "keine Kategorie".
  const kategorieZiel =
    typeof kategorieRoh === "string" && kategorieRoh ? kategorieRoh : null;
  const normZiel = normalisiereMannschaftsname(name);

  await withTenant(vereinId, async (tx) => {
    const [mannschaft] = await tx
      .insert(mannschaften)
      .values({
        vereinId,
        name: name.trim(),
        // Aus dem nuLiga-Import vorbefüllt (z.B. "Mä/männl." oder eine
        // Jugendklasse) — spart manuelles Nachtragen, bleibt aber änderbar.
        altersklasse: kategorieZiel,
      })
      .returning();

    // Bestehende, noch nicht verknüpfte Rundenspiele rückwirkend mit der
    // neu angelegten Mannschaft verknüpfen (nicht nur künftige Importe).
    // Kategorie muss ebenfalls übereinstimmen, sonst würden z.B. eine
    // Herren- und eine gleichnamige Jugendmannschaft vermischt.
    const offeneRundenspiele = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        eq(termine.typ, "rundenspiel"),
        isNull(termine.mannschaftId)
      ),
    });
    for (const r of offeneRundenspiele) {
      if ((r.kategorie ?? null) !== kategorieZiel) continue;
      const heimNorm = r.heimMannschaftName
        ? normalisiereMannschaftsname(r.heimMannschaftName)
        : null;
      const auswaertsNorm = r.auswaertsMannschaftName
        ? normalisiereMannschaftsname(r.auswaertsMannschaftName)
        : null;
      if (heimNorm === normZiel || auswaertsNorm === normZiel) {
        await tx
          .update(termine)
          .set({ mannschaftId: mannschaft.id })
          .where(eq(termine.id, r.id));
      }
    }
  });

  revalidatePath("/admin/rundenspiele");
  revalidatePath("/admin/mannschaften");
}
