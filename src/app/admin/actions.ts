"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requireAdminSchreibzugriff, requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  ignorierteMannschaften,
  mannschaften,
  schiedsrichterProfile,
  termine,
  terminZuordnungen,
  users,
} from "@/db/schema";
import { parseFunktionstraegerExcel } from "@/lib/funktionstraeger-import";
import { normalisiereMannschaftsname } from "@/lib/rundenspiel-import";
import { synchronisiereHandballNetMannschaften } from "@/lib/handball-net-sync";
import { vergebeEinmalPasswortFallsNoetig } from "@/lib/passwort";
import { sendMail } from "@/lib/mailer";
import { appUrl } from "@/lib/app-url";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { parseBerlinDatumZeit } from "@/lib/format";
import { istTurnierBerechtigt } from "@/lib/turnier-zugriff";
import { generiereOeffentlichenToken } from "@/lib/token";

// einmalPasswort ist nur bei einer neu vergebenen Einmal-Passwort-Zeile
// gesetzt (siehe vergebeEinmalPasswortFallsNoetig) — hat die Person schon
// eins (oder loggt sich per Magic-Link ein), bleibt es null. Ein
// EmailInhalt statt getrennter Text-/Html-Funktionen (wie in login-mail.ts/
// termin-mail.ts) — siehe CLAUDE.md, EIN Aufbau für beide Formate ist
// weniger fehleranfällig als zwei parallel gepflegte Texte.
function willkommensInhalt(
  vereinName: string,
  email: string,
  einmalPasswort: string | null
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Für dich wurde ein Zugang angelegt.",
    zeilen: einmalPasswort
      ? [
          `Melde dich mit deiner E-Mail-Adresse (${email}) und dem folgenden Einmal-Passwort an.`,
          `Einmal-Passwort: ${einmalPasswort}`,
          "Direkt nach dem ersten Login musst du ein eigenes Passwort vergeben. Alternativ kannst du dich jederzeit auch ohne Passwort per Login-Link einloggen.",
        ]
      : [
          `Melde dich mit deiner E-Mail-Adresse (${email}) an — du bekommst dort einen Login-Link per E-Mail zugeschickt.`,
        ],
    cta: { text: "Jetzt einloggen", url: `${appUrl()}/login` },
  };
}

// Nur Ziffern (siehe URL der handball.net-Team-Seite, z.B.
// handball.net/team/69770 → Team-ID 69770) — dieselbe Validierung wie bei
// den nuLiga-Hallen-IDs (parseHalleId in admin/einstellungen/actions.ts).
function parseHandballNetTeamId(formData: FormData): string | null {
  const roh = formData.get("handballNetTeamId");
  if (typeof roh !== "string" || !roh.trim()) return null;
  if (!/^\d+$/.test(roh.trim())) {
    throw new Error("handball.net-Team-ID: bitte nur Zahlen eingeben.");
  }
  return roh.trim();
}

export async function createMannschaft(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const name = formData.get("name");
  const altersklasse = formData.get("altersklasse");
  const handballNetTeamId = parseHandballNetTeamId(formData);
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
      handballNetTeamId,
    })
  );

  revalidatePath("/admin/mannschaften");
}

export async function updateMannschaft(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const mannschaftId = formData.get("mannschaftId");
  const name = formData.get("name");
  const altersklasse = formData.get("altersklasse");
  const handballNetTeamId = parseHandballNetTeamId(formData);
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
        handballNetTeamId,
      })
      .where(
        and(eq(mannschaften.id, mannschaftId), eq(mannschaften.vereinId, vereinId))
      )
  );

  revalidatePath("/admin/mannschaften");
}

// Stößt sofort einen Sync für alle Mannschaften mit gepflegter
// handball.net-Team-ID an (statt auf den nächsten Cron-Lauf zu warten) —
// analog zum sofortigen ersten nuLiga-Sync beim Speichern der Hallen-IDs
// (siehe nuligaEinstellungenSpeichern in admin/einstellungen/actions.ts).
export async function handballNetSynchronisieren() {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const alleMannschaften = await withTenant(vereinId, (tx) =>
    tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
    })
  );
  const konfiguriert = alleMannschaften
    .filter((m): m is typeof m & { handballNetTeamId: string } => !!m.handballNetTeamId)
    .map((m) => ({ id: m.id, handballNetTeamId: m.handballNetTeamId }));

  const ergebnis = await synchronisiereHandballNetMannschaften(vereinId, konfiguriert);

  const params = new URLSearchParams();
  params.set("hnNeu", String(ergebnis.neu));
  params.set("hnAktualisiert", String(ergebnis.aktualisiert));
  params.set("hnEntfernt", String(ergebnis.entfernt));
  const fehlerListe = [
    ...ergebnis.abrufFehler.map((f) => `Team ${f.teamId}: ${f.grund}`),
    ...ergebnis.parseFehler.map((f) => `Eintrag ${f.index}: ${f.grund}`),
  ];
  if (fehlerListe.length) params.set("hnFehler", fehlerListe.join(" | "));

  const spieleGesamt = ergebnis.diagnose.reduce((s, d) => s + d.spieleGefunden, 0);
  const statusCodes = [...new Set(ergebnis.diagnose.map((d) => d.httpStatus))];
  params.set(
    "hnDiagnose",
    `${ergebnis.diagnose.length} Mannschaft(en) abgefragt, HTTP ${
      statusCodes.join("/") || "—"
    }, ${spieleGesamt} Spiele gefunden`
  );

  revalidatePath("/admin/mannschaften");
  redirect(`/admin/mannschaften?${params.toString()}`);
}

export async function deleteMannschaft(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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

// Mehrfachauswahl-Löschen (siehe MannschaftenTabelle) — z.B. um Dubletten aus
// unsauberem manuellem Anlegen in einem Schritt aufzuräumen, statt jede
// einzeln über deleteMannschaft entfernen zu müssen.
export async function deleteMannschaften(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const mannschaftIds = formData
    .getAll("mannschaftId")
    .filter((id): id is string => typeof id === "string" && !!id);
  if (mannschaftIds.length === 0) {
    throw new Error("Keine Mannschaft ausgewählt.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .delete(mannschaften)
      .where(
        and(
          inArray(mannschaften.id, mannschaftIds),
          eq(mannschaften.vereinId, vereinId)
        )
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
  "kassierer",
  "schiedsrichterwart",
  "zeitnehmerwart",
  "ordnerwart",
] as const;

// Für die Rollen-Info-Mail unten (rollenHinzugefuegtInhalt) — dieselben
// Bezeichnungen wie TYP_LABEL in FunktionstraegerTabelle, hier separat
// gepflegt, da diese Datei (Server Action) nicht aus der Client-Komponente
// importieren soll.
const FUNKTIONSTRAEGER_TYP_LABEL: Record<
  (typeof FUNKTIONSTRAEGER_TYPEN)[number],
  string
> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
  schiedsrichterwart: "Schiedsrichterwart",
  zeitnehmerwart: "Zeitnehmer-/Sekretärwart",
  ordnerwart: "Ordner-/Kioskdienst-/Kassiererwart",
};

// Für rolleHinzufuegen unten — die Person hat schon einen Zugang (sonst
// stünde sie nicht in dieser Liste), braucht also keine Login-Anleitung wie
// willkommensInhalt, nur eine Info über die neu zugewiesene(n) Rolle(n) —
// alle auf einmal in EINER Mail, egal wie viele gleichzeitig hinzugefügt
// wurden.
function rollenHinzugefuegtInhalt(
  vereinName: string,
  rollenLabels: string[]
): EmailInhalt {
  return {
    vereinName,
    ueberschrift:
      rollenLabels.length === 1
        ? `Du wurdest als ${rollenLabels[0]} eingetragen.`
        : `Du wurdest eingetragen als: ${rollenLabels.join(", ")}.`,
    zeilen: [],
    cta: { text: "Zum Login", url: `${appUrl()}/login` },
  };
}

export async function createFunktionstraeger(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const email = formData.get("email");
  const name = formData.get("name");
  const typen = formData.getAll("typen");
  const mannschaftId = formData.get("mannschaftId");
  // Checkbox: ist sie nicht angehakt, fehlt der Formularwert komplett.
  const sofortAktiv = formData.get("sofortAktiv") === "on";
  const alsAdmin = formData.get("istAdmin") === "on";
  const alsAdminLesend = formData.get("istAdminLesend") === "on";

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
  // Admin (voll oder nur lesend) zählt als eigenständige "Rolle" für die
  // Mindestanforderung — eine Person kann bewusst NUR Admin sein, ohne
  // aktiven Funktionsträger-Typ (z.B. ein Vorstandsmitglied ohne eigenen
  // Dienst).
  if (typen.length === 0 && !alsAdmin && !alsAdminLesend) {
    throw new Error("Bitte mindestens eine Rolle auswählen (oder Admin).");
  }
  const ausgewaehlteTypen = typen as (typeof FUNKTIONSTRAEGER_TYPEN)[number][];
  const normalizedEmail = email.trim().toLowerCase();

  const { vereinName, einmalPasswort } = await withTenant(vereinId, async (tx) => {
    let user = await tx.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    // vereinId === null bei einer bestehenden Zeile heißt NICHT "gehört
    // einem anderen Verein": Auth.js (Magic-Link-Provider, siehe auth.ts)
    // legt schon beim bloßen ANFORDERN eines Login-Links einen User-Datensatz
    // an, noch vor jeder Bestätigung — z.B. wenn die Person schon vorab auf
    // /login versucht hat, sich mit ihrer E-Mail einzuloggen. Diese Zeile ist
    // keine echte Zuordnung und wird unten für diesen Verein übernommen,
    // statt fälschlich als Kollision blockiert zu werden.
    if (user && user.vereinId !== null && user.vereinId !== vereinId) {
      throw new Error(
        "Diese E-Mail-Adresse ist bereits einem anderen Verein zugeordnet."
      );
    }
    const verwaisterStub = !!user && user.vereinId === null;

    let einmalPasswort: string | null = null;
    if (!user || verwaisterStub) {
      if (user) {
        [user] = await tx
          .update(users)
          .set({
            name: name.trim(),
            vereinId,
            istAdmin: alsAdmin,
            istAdminLesend: alsAdminLesend,
          })
          .where(eq(users.id, user.id))
          .returning();
      } else {
        [user] = await tx
          .insert(users)
          .values({
            email: normalizedEmail,
            name: name.trim(),
            vereinId,
            istAdmin: alsAdmin,
            istAdminLesend: alsAdminLesend,
          })
          .returning();
      }
      // Nur bei sofortAktiv gleich vergeben, da nur dann auch sofort die
      // Willkommens-Mail mit dem Einmal-Passwort rausgeht (siehe unten) —
      // sonst bekäme die Person ein Passwort, das nirgends auftaucht.
      if (sofortAktiv) {
        einmalPasswort = await vergebeEinmalPasswortFallsNoetig(
          tx,
          user.id,
          user.passwordHash
        );
      }
    } else {
      // Nur BEFÖRDERN, nie hier degradieren — dieses Formular dient auch
      // dazu, einer bestehenden Person eine weitere Rolle zu ergänzen, ohne
      // versehentlich ihre Admin-Rechte zu entziehen, wenn eine der
      // Checkboxen beim erneuten Absenden nicht angehakt ist (siehe
      // adminRechteToggeln/adminLesendRechteToggeln für die bewusste
      // Degradierung).
      const aenderungen: Partial<typeof users.$inferInsert> = {};
      if (alsAdmin && !user.istAdmin) aenderungen.istAdmin = true;
      if (alsAdminLesend && !user.istAdminLesend) aenderungen.istAdminLesend = true;
      if (Object.keys(aenderungen).length > 0) {
        await tx.update(users).set(aenderungen).where(eq(users.id, user.id));
        user = { ...user, ...aenderungen };
      }
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

    return { vereinName: vereinRow?.name ?? "deinem Verein", einmalPasswort };
  });

  // Die Willkommens-Mail ist an "aktiv" gekoppelt, nicht an "neu angelegt":
  // ohne Login angelegte Personen bekommen die Mail erst beim späteren
  // Aktivieren (siehe funktionstraegerAktivToggeln).
  if (sofortAktiv) {
    try {
      const inhalt = willkommensInhalt(vereinName, normalizedEmail, einmalPasswort);
      await sendMail(
        normalizedEmail,
        "Zugang für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Einer BEREITS bestehenden Person eine oder mehrere zusätzliche Rollen auf
// einmal zuweisen (Checkbox-Mehrfachauswahl statt Einzel-Dropdown, siehe
// FunktionstraegerTabelle) — bisher ging das nur über das "Neuer
// Funktionsträger"-Formular (per Name+E-Mail, die dann auf die vorhandene
// Person matcht), was im Bearbeiten-Panel jeder Zeile nicht
// ersichtlich/erreichbar war. Direkt per userId statt per E-Mail, da die
// Person hier schon eindeutig feststeht.
export async function rolleHinzufuegen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const userId = formData.get("userId");
  const typen = formData.getAll("typ");
  const mannschaftId = formData.get("mannschaftId");

  if (typeof userId !== "string" || !userId) {
    throw new Error("Person fehlt.");
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
  if (typen.length === 0) {
    throw new Error("Bitte mindestens eine Rolle auswählen.");
  }
  const typedTypen = typen as (typeof FUNKTIONSTRAEGER_TYPEN)[number][];

  const { email, vereinName, neueRollenLabels } = await withTenant(vereinId, async (tx) => {
    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!person) throw new Error("Person nicht gefunden.");

    const neueRollenLabels: string[] = [];
    for (const typedTyp of typedTypen) {
      const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
        where: and(
          eq(funktionstraegerRollen.userId, userId),
          eq(funktionstraegerRollen.typ, typedTyp)
        ),
      });
      if (vorhandeneRolle) continue;

      await tx.insert(funktionstraegerRollen).values({
        userId,
        typ: typedTyp,
        mannschaftId:
          typedTyp === "trainer" && typeof mannschaftId === "string" && mannschaftId
            ? mannschaftId
            : null,
        // Direkt aktiv: die Person ist bereits bekannt/eingeloggt, es geht nur
        // um zusätzliche Rollen — kein separater Onboarding-Schritt wie bei
        // createFunktionstraeger nötig.
        aktiv: true,
      });
      neueRollenLabels.push(FUNKTIONSTRAEGER_TYP_LABEL[typedTyp]);
    }

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return {
      email: person.email,
      vereinName: vereinRow?.name ?? "deinem Verein",
      neueRollenLabels,
    };
  });

  // Alle auf einmal hinzugefügten Rollen in EINER Mail, egal wie viele
  // ausgewählt wurden (siehe rollenHinzugefuegtInhalt oben) — waren alle
  // ausgewählten Rollen bereits vorhanden, bleibt neueRollenLabels leer und
  // es geht keine Mail raus.
  if (neueRollenLabels.length > 0) {
    try {
      const inhalt = rollenHinzugefuegtInhalt(vereinName, neueRollenLabels);
      await sendMail(
        email,
        "Neue Rolle für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Rollen-Info-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Mehrfachauswahl-Variante von rolleHinzufuegen oben: dieselbe(n) Rolle(n)
// auf einmal für MEHRERE bereits bestehende Personen anlegen (siehe
// Mehrfachauswahl-Leiste in FunktionstraegerTabelle) — z.B. um mehrere neue
// Trainer derselben Mannschaft oder mehrere neue Ordner in einem Rutsch
// anzulegen, statt jede Person einzeln im Bearbeiten-Panel aufzuklappen.
// Jede Person bekommt trotzdem ihre EIGENE, auf ihre tatsächlich neuen
// Rollen begrenzte Info-Mail (eine Person kann eine der ausgewählten Rollen
// schon haben, eine andere nicht) — analog zur Gruppierung in
// funktionstraegerRollenAktivierenEinzeln unten.
export async function rollenHinzufuegenMehrfach(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const userIds = formData
    .getAll("userId")
    .filter((v): v is string => typeof v === "string" && !!v);
  const typen = formData.getAll("typ");
  const mannschaftId = formData.get("mannschaftId");

  if (userIds.length === 0) {
    throw new Error("Bitte mindestens eine Person auswählen.");
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
  if (typen.length === 0) {
    throw new Error("Bitte mindestens eine Rolle auswählen.");
  }
  const typedTypen = typen as (typeof FUNKTIONSTRAEGER_TYPEN)[number][];

  const { benachrichtigungen, vereinName } = await withTenant(vereinId, async (tx) => {
    const benachrichtigungen: { email: string; neueRollenLabels: string[] }[] = [];
    for (const userId of userIds) {
      const person = await tx.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
      });
      if (!person) continue;

      const neueRollenLabels: string[] = [];
      for (const typedTyp of typedTypen) {
        const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
          where: and(
            eq(funktionstraegerRollen.userId, userId),
            eq(funktionstraegerRollen.typ, typedTyp)
          ),
        });
        if (vorhandeneRolle) continue;

        await tx.insert(funktionstraegerRollen).values({
          userId,
          typ: typedTyp,
          mannschaftId:
            typedTyp === "trainer" && typeof mannschaftId === "string" && mannschaftId
              ? mannschaftId
              : null,
          aktiv: true,
        });
        neueRollenLabels.push(FUNKTIONSTRAEGER_TYP_LABEL[typedTyp]);
      }
      if (neueRollenLabels.length > 0) {
        benachrichtigungen.push({ email: person.email, neueRollenLabels });
      }
    }

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return { benachrichtigungen, vereinName: vereinRow?.name ?? "deinem Verein" };
  });

  for (const { email, neueRollenLabels } of benachrichtigungen) {
    try {
      const inhalt = rollenHinzugefuegtInhalt(vereinName, neueRollenLabels);
      await sendMail(
        email,
        "Neue Rolle für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Rollen-Info-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Statt Löschen: eine Rolle wird deaktiviert (bleibt in der
// Zuordnungs-Historie erhalten), taucht aber nicht mehr in Zuordnung/
// Selbst-Anmeldung auf.
export async function funktionstraegerAktivToggeln(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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
        userId: funktionstraegerRollen.userId,
        email: users.email,
        passwordHash: users.passwordHash,
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

    const einmalPasswort = await vergebeEinmalPasswortFallsNoetig(
      tx,
      rolle.userId,
      rolle.passwordHash
    );
    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return {
      email: rolle.email,
      vereinName: vereinRow?.name ?? "deinem Verein",
      einmalPasswort,
    };
  });

  // Beim (Wieder-)Aktivieren geht die Willkommens-Mail raus — für Personen,
  // die bewusst "ohne Login" angelegt wurden (siehe createFunktionstraeger /
  // funktionstraegerImportieren), ist das der erste Zeitpunkt, an dem sie
  // vom Zugang erfahren.
  if (aktivierung) {
    try {
      const inhalt = willkommensInhalt(
        aktivierung.vereinName,
        aktivierung.email,
        aktivierung.einmalPasswort
      );
      await sendMail(
        aktivierung.email,
        "Zugang für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Bündelt die Aktivierung mehrerer einzelner Rollen (Checkbox-Mehrfachauswahl
// im Bearbeiten-Panel einer Person, siehe FunktionstraegerTabelle) — anders
// als funktionstraegerRollenAktivieren unten (das nach PERSON filtert und
// dabei ALLE ihre inaktiven Rollen aktiviert) hier gezielt nur die
// ausgewählten Rollen, damit eine bewusst weiterhin inaktiv gehaltene Rolle
// nicht versehentlich mitaktiviert wird. Sendet trotzdem nur EINE
// Willkommens-Mail pro Person, auch wenn mehrere ihrer Rollen auf einmal
// aktiviert werden — sonst kämen bei drei aktivierten Rollen drei
// (redundante) Mails hintereinander.
export async function funktionstraegerRollenAktivierenEinzeln(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const rolleIds = formData
    .getAll("rolleId")
    .filter((id): id is string => typeof id === "string" && !!id);
  if (rolleIds.length === 0) {
    throw new Error("Keine Rolle ausgewählt.");
  }

  const { aktivierte, vereinName } = await withTenant(vereinId, async (tx) => {
    const rollen = await tx
      .select({
        id: funktionstraegerRollen.id,
        userId: funktionstraegerRollen.userId,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(
          inArray(funktionstraegerRollen.id, rolleIds),
          eq(users.vereinId, vereinId),
          eq(funktionstraegerRollen.aktiv, false)
        )
      );
    if (rollen.length === 0) return { aktivierte: [], vereinName: "" };

    await tx
      .update(funktionstraegerRollen)
      .set({ aktiv: true })
      .where(inArray(funktionstraegerRollen.id, rollen.map((r) => r.id)));

    // Mehrere ausgewählte Rollen können zur selben Person gehören — pro
    // Person trotzdem nur EIN Einmal-Passwort/EINE Mail (siehe Kommentar
    // oben), daher hier zusammenfassen statt pro Rolle zu iterieren.
    const proPerson = new Map(
      rollen.map((r) => [r.userId, { email: r.email, passwordHash: r.passwordHash }])
    );

    const aktivierte: { email: string; einmalPasswort: string | null }[] = [];
    for (const [userId, person] of proPerson) {
      const einmalPasswort = await vergebeEinmalPasswortFallsNoetig(
        tx,
        userId,
        person.passwordHash
      );
      aktivierte.push({ email: person.email, einmalPasswort });
    }

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return { aktivierte, vereinName: vereinRow?.name ?? "deinem Verein" };
  });

  for (const person of aktivierte) {
    try {
      const inhalt = willkommensInhalt(vereinName, person.email, person.einmalPasswort);
      await sendMail(
        person.email,
        "Zugang für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

// Bulk-Variante von funktionstraegerAktivToggeln für die Mehrfachauswahl in
// FunktionstraegerTabelle: aktiviert alle inaktiven Rollen der ausgewählten
// Personen auf einmal, statt Rolle für Rolle einzeln durchklicken zu müssen.
export async function funktionstraegerRollenAktivieren(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const userIds = formData
    .getAll("userId")
    .filter((id): id is string => typeof id === "string" && !!id);
  if (userIds.length === 0) {
    throw new Error("Keine Person ausgewählt.");
  }

  const { aktivierte, vereinName } = await withTenant(vereinId, async (tx) => {
    const personen = await tx
      .select({
        userId: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(and(inArray(users.id, userIds), eq(users.vereinId, vereinId)));

    const aktivierte: { email: string; einmalPasswort: string | null }[] = [];
    for (const person of personen) {
      const zuvorInaktiv = await tx
        .update(funktionstraegerRollen)
        .set({ aktiv: true })
        .where(
          and(
            eq(funktionstraegerRollen.userId, person.userId),
            eq(funktionstraegerRollen.aktiv, false)
          )
        )
        .returning({ id: funktionstraegerRollen.id });
      if (zuvorInaktiv.length === 0) continue;

      const einmalPasswort = await vergebeEinmalPasswortFallsNoetig(
        tx,
        person.userId,
        person.passwordHash
      );
      aktivierte.push({ email: person.email, einmalPasswort });
    }

    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    return { aktivierte, vereinName: vereinRow?.name ?? "deinem Verein" };
  });

  for (const person of aktivierte) {
    try {
      const inhalt = willkommensInhalt(vereinName, person.email, person.einmalPasswort);
      await sendMail(
        person.email,
        "Zugang für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/funktionstraeger");
}

function emailGeaendertInhalt(
  vereinName: string,
  neueEmail: string,
  istNeueAdresse: boolean
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Deine E-Mail-Adresse wurde geändert.",
    zeilen: istNeueAdresse
      ? [`Du kannst dich ab sofort mit ${neueEmail} einloggen.`]
      : [
          `Dein Zugang läuft jetzt über ${neueEmail}.`,
          "Falls das nicht du warst bzw. dir diese Änderung nicht bekannt vorkommt, melde dich bitte beim Vereinsadmin.",
        ],
    cta: istNeueAdresse
      ? { text: "Zum Login", url: `${appUrl()}/login` }
      : undefined,
  };
}

// Name/E-Mail einer bestehenden Person bearbeiten. Bei E-Mail-Änderung geht
// eine Info sowohl an die neue als auch an die alte Adresse raus, damit ein
// versehentlicher/unbefugter Wechsel auffällt.
export async function updateFunktionstraeger(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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
        if (belegt.vereinId !== null) {
          throw new Error(
            "Diese E-Mail-Adresse wird bereits von einem anderen Zugang verwendet."
          );
        }
        // vereinId === null: keine echte Zuordnung, sondern nur eine
        // verwaiste Zeile aus einem Magic-Link-Login-Versuch (siehe
        // Kommentar bei createFunktionstraeger oben) — im Weg räumen statt
        // fälschlich als Kollision zu blockieren.
        await tx.delete(users).where(eq(users.id, belegt.id));
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
      const inhalt = emailGeaendertInhalt(ergebnis.vereinName, ergebnis.neueEmail, true);
      await sendMail(
        ergebnis.neueEmail,
        "E-Mail-Adresse geändert",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Info-Mail an neue Adresse fehlgeschlagen:", err);
    }
    try {
      const inhalt = emailGeaendertInhalt(ergebnis.vereinName, ergebnis.neueEmail, false);
      await sendMail(
        ergebnis.alteEmail,
        "E-Mail-Adresse geändert",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
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
  const session = await requireAdminSchreibzugriff();
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

// Analog zu adminRechteToggeln oben, aber für die "nur lesend"-Variante
// (istAdminLesend) — eigene Rolle statt eines dritten Werts auf istAdmin,
// damit beide unabhängig voneinander vergeben/entzogen werden können (auch
// wenn "voll + nur lesend gleichzeitig" praktisch bedeutungslos ist, da
// requireAdminSchreibzugriff() ohnehin nur istAdmin prüft).
export async function adminLesendRechteToggeln(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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
      .set({ istAdminLesend: !person.istAdminLesend })
      .where(eq(users.id, userId));
  });

  revalidatePath("/admin/funktionstraeger");
}

// Mehrfachauswahl-Löschen (siehe FunktionstraegerTabelle) — echtes Löschen
// der Person inkl. Login, Rollen und kompletter Einsatz-Historie/Zuordnungen
// (Cascade-Delete, siehe schema.ts), z.B. um Karteileichen/Dubletten
// aufzuräumen. "users" hat bewusst KEIN RLS (siehe
// 0001_enable_rls_multi_tenant.sql) — die Zugehörigkeit zum eigenen Verein
// wird deshalb hier explizit geprüft. Die eigene userId wird aus der Auswahl
// gefiltert statt die ganze Aktion abzubrechen, da die UI sie ohnehin nicht
// zur Auswahl anbietet (Selbstlöschung wäre sonst möglich, falls die
// Formulardaten manipuliert werden).
export async function deleteFunktionstraeger(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const userIds = formData
    .getAll("userId")
    .filter(
      (id): id is string =>
        typeof id === "string" && !!id && id !== session.user.id
    );
  if (userIds.length === 0) {
    throw new Error("Keine Person ausgewählt.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .delete(users)
      .where(and(inArray(users.id, userIds), eq(users.vereinId, vereinId)))
  );

  revalidatePath("/admin/funktionstraeger");
}

// Führt zwei Personen-Accounts zu einem zusammen — für den Fall, dass
// dieselbe reale Person versehentlich zweimal angelegt wurde (z.B. durch
// eine öffentliche Selbsteintragung unter leicht anderer Schreibweise, siehe
// findeFunktionstraegerDuplikate). Der Admin wählt bewusst manuell, welcher
// der beiden Accounts (und damit welche E-Mail/welches Login) bestehen
// bleibt — kein automatisches Erraten, das wäre bei echten Logins zu
// riskant. Rollen und Einsatz-Historie des anderen Accounts werden auf den
// verbleibenden übertragen (sonst verschwänden vergangene Einsätze aus der
// Statistik), danach wird der andere Account gelöscht — Cascade (siehe
// schema.ts) räumt den Rest (Login-Session, Push-Abos, Sync-Log,
// Benachrichtigungs-Historie) automatisch mit auf, ohne eigene Übertragung,
// da das nur Nebensächliches ist.
export async function funktionstraegerZusammenfuehren(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const behaltenUserId = formData.get("behaltenUserId");
  const userIdA = formData.get("userIdA");
  const userIdB = formData.get("userIdB");

  if (
    typeof behaltenUserId !== "string" ||
    !behaltenUserId ||
    typeof userIdA !== "string" ||
    !userIdA ||
    typeof userIdB !== "string" ||
    !userIdB ||
    (behaltenUserId !== userIdA && behaltenUserId !== userIdB)
  ) {
    throw new Error("Ungültige Auswahl.");
  }
  const entferntUserId = behaltenUserId === userIdA ? userIdB : userIdA;

  await withTenant(vereinId, async (tx) => {
    const [behalten, entfernt] = await Promise.all([
      tx.query.users.findFirst({
        where: and(eq(users.id, behaltenUserId), eq(users.vereinId, vereinId)),
      }),
      tx.query.users.findFirst({
        where: and(eq(users.id, entferntUserId), eq(users.vereinId, vereinId)),
      }),
    ]);
    if (!behalten || !entfernt) throw new Error("Person nicht gefunden.");

    // Rollen: dieselbe Rolle darf am Ende nur einmal existieren (siehe
    // Prüfung in rolleHinzufuegen oben) — eine bereits beim verbleibenden
    // Account vorhandene Rolle gewinnt (ggf. auf aktiv "befördert"), sonst
    // wird die Zeile des anderen Accounts übernommen.
    const [behalteneRollen, entfernteRollen] = await Promise.all([
      tx.query.funktionstraegerRollen.findMany({
        where: eq(funktionstraegerRollen.userId, behaltenUserId),
      }),
      tx.query.funktionstraegerRollen.findMany({
        where: eq(funktionstraegerRollen.userId, entferntUserId),
      }),
    ]);
    for (const rolle of entfernteRollen) {
      const vorhandene = behalteneRollen.find((r) => r.typ === rolle.typ);
      if (vorhandene) {
        if (rolle.aktiv && !vorhandene.aktiv) {
          await tx
            .update(funktionstraegerRollen)
            .set({ aktiv: true })
            .where(eq(funktionstraegerRollen.id, vorhandene.id));
        }
        await tx
          .delete(funktionstraegerRollen)
          .where(eq(funktionstraegerRollen.id, rolle.id));
      } else {
        await tx
          .update(funktionstraegerRollen)
          .set({ userId: behaltenUserId })
          .where(eq(funktionstraegerRollen.id, rolle.id));
      }
    }

    // Einsatz-Historie: dieselbe Rolle am selben Termin darf am Ende nur
    // einmal existieren, sonst tauchte sie in Kalender/Statistik doppelt auf.
    const [behalteneZuordnungen, entfernteZuordnungen] = await Promise.all([
      tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.userId, behaltenUserId),
      }),
      tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.userId, entferntUserId),
      }),
    ]);
    for (const zuordnung of entfernteZuordnungen) {
      const doppelt = behalteneZuordnungen.some(
        (z) =>
          z.terminId === zuordnung.terminId &&
          z.funktionstraegerTyp === zuordnung.funktionstraegerTyp
      );
      if (doppelt) {
        await tx
          .delete(terminZuordnungen)
          .where(eq(terminZuordnungen.id, zuordnung.id));
      } else {
        await tx
          .update(terminZuordnungen)
          .set({ userId: behaltenUserId })
          .where(eq(terminZuordnungen.id, zuordnung.id));
      }
    }
    // Unbestätigte Namens-Vorschläge (siehe matchVorschlagUserId in
    // schema.ts) — unkritisch, einfach mit übernehmen.
    await tx
      .update(terminZuordnungen)
      .set({ matchVorschlagUserId: behaltenUserId })
      .where(eq(terminZuordnungen.matchVorschlagUserId, entferntUserId));

    // Weitere Verweise auf den entfernten Account, die sonst durch
    // Cascade/SET NULL beim Löschen unten verlorengingen (siehe schema.ts).
    await tx
      .update(termine)
      .set({ erstelltVon: behaltenUserId })
      .where(eq(termine.erstelltVon, entferntUserId));
    await tx
      .update(termine)
      .set({ icsSchiedsrichterId: behaltenUserId })
      .where(eq(termine.icsSchiedsrichterId, entferntUserId));
    await tx
      .update(termine)
      .set({ turnierVerantwortlicherId: behaltenUserId })
      .where(eq(termine.turnierVerantwortlicherId, entferntUserId));

    // schiedsrichter_profil hat userId als Primärschlüssel — existiert beim
    // verbleibenden Account bereits eine Zeile, bleibt sie (kann nicht
    // einfach überschrieben werden), sonst wird die des anderen übernommen.
    const behaltenesProfil = await tx.query.schiedsrichterProfile.findFirst({
      where: eq(schiedsrichterProfile.userId, behaltenUserId),
    });
    if (!behaltenesProfil) {
      await tx
        .update(schiedsrichterProfile)
        .set({ userId: behaltenUserId })
        .where(eq(schiedsrichterProfile.userId, entferntUserId));
    }

    // Admin-Rechte nur BEFÖRDERN, nie durch den Merge versehentlich
    // verlieren (analog zu createFunktionstraeger oben).
    const aenderungen: Partial<typeof users.$inferInsert> = {};
    if (entfernt.istAdmin && !behalten.istAdmin) aenderungen.istAdmin = true;
    if (entfernt.istAdminLesend && !behalten.istAdminLesend) {
      aenderungen.istAdminLesend = true;
    }
    if (Object.keys(aenderungen).length > 0) {
      await tx.update(users).set(aenderungen).where(eq(users.id, behaltenUserId));
    }

    await tx.delete(users).where(eq(users.id, entferntUserId));
  });

  revalidatePath("/admin/funktionstraeger");
}

export async function funktionstraegerImportieren(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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
  const neueNutzer: { email: string; einmalPasswort: string | null }[] = [];

  const vereinName = await withTenant(vereinId, async (tx) => {
    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
    });

    for (const zeile of zeilen) {
      let user = await tx.query.users.findFirst({
        where: eq(users.email, zeile.email),
      });
      // vereinId === null: keine echte Zuordnung, sondern nur eine
      // verwaiste Zeile aus einem Magic-Link-Login-Versuch (siehe Kommentar
      // bei createFunktionstraeger oben) — wird unten übernommen statt
      // fälschlich als Kollision übersprungen zu werden.
      if (user && user.vereinId !== null && user.vereinId !== vereinId) {
        fehlerListe.push(
          `Zeile ${zeile.zeilenNr}: E-Mail bereits einem anderen Verein zugeordnet.`
        );
        continue;
      }
      if (!user || user.vereinId === null) {
        if (user) {
          [user] = await tx
            .update(users)
            .set({ name: zeile.name, vereinId })
            .where(eq(users.id, user.id))
            .returning();
        } else {
          [user] = await tx
            .insert(users)
            .values({ email: zeile.email, name: zeile.name, vereinId })
            .returning();
        }
        if (sofortAktiv) {
          const einmalPasswort = await vergebeEinmalPasswortFallsNoetig(
            tx,
            user.id,
            user.passwordHash
          );
          neueNutzer.push({ email: user.email, einmalPasswort });
        }
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
      const inhalt = willkommensInhalt(vereinName, nutzer.email, nutzer.einmalPasswort);
      await sendMail(
        nutzer.email,
        "Zugang für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
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
  const session = await requireAdminSchreibzugriff();
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

  await withTenant(vereinId, async (tx) => {
    // Turniere bekommen sofort einen Freigabe-Token für die öffentliche,
    // login-freie Lese-Ansicht (/turnier/[token]) — mit Vereinsnamen als
    // lesbarem Präfix (siehe generiereOeffentlichenToken).
    let freigabeToken: string | null = null;
    if (typ === "turnier") {
      const vereinRow = await tx.query.vereine.findFirst({
        where: (v, { eq }) => eq(v.id, vereinId),
      });
      freigabeToken = generiereOeffentlichenToken(vereinRow?.name ?? "");
    }

    await tx.insert(termine).values({
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
      freigabeToken,
    });
  });

  revalidatePath("/admin/termine");
}

// Geteilte Kernlogik zwischen updateTermin (dedizierte Bearbeiten-Seite,
// springt danach zur Liste zurück) und updateTerminInline (Schnell-Bearbeiten
// direkt im Kalender-Modal, bleibt auf der Kalenderseite) — beide validieren/
// speichern identisch, unterscheiden sich nur im Verhalten NACH dem Speichern.
async function aktualisiereTerminFelder(
  session: Awaited<ReturnType<typeof requireAdminSchreibzugriff>>,
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
  const session = await requireAdminSchreibzugriff();
  await aktualisiereTerminFelder(session, formData);

  revalidatePath("/admin/termine");
  redirect("/admin/termine");
}

// Schnell-Bearbeiten direkt im Kalender-Modal (siehe MonatsKalender-Balken)
// — bewusst OHNE redirect, damit der Admin auf der Kalenderseite bleibt
// statt zur Termine-Liste zu springen.
export async function updateTerminInline(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  await aktualisiereTerminFelder(session, formData);

  revalidatePath("/admin/kalender");
  revalidatePath("/admin/termine");
}

export async function deleteTermin(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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

// Verknüpft ein manuell angelegtes Freundschaftsspiel oder Turnier-
// Einzelspiel (typ "testspiel"/"turnier_spiel") mit dem später offiziell
// über den Hallenspielplan importierten Rundenspiel, das sich als Duplikat
// herausgestellt hat — automatisch vorgeschlagen (siehe
// findeSpielDuplikate) oder manuell ausgewählt (siehe /admin/termine (Hallenspielplan-Tab)).
// Statt den doppelten Termin einfach zu löschen (und damit bereits erfasste
// Zuordnungen wie Schiedsrichter/Zeitnehmer/Sekretär zu verlieren, die per
// ON DELETE CASCADE an termin_id hängen), werden diese zuerst auf das
// Rundenspiel übertragen. Bereits am Rundenspiel vorhandene, inhaltlich
// identische Zuordnungen (gleiche Rolle + gleiche Person) werden dabei
// verworfen statt dupliziert. Bei einem Turnier-Einzelspiel wird zusätzlich
// dessen Turnier-Zugehörigkeit auf das Rundenspiel übertragen, damit es
// weiterhin im Turnier-Spielplan (siehe turnier-spielplan.tsx) bzw. auf der
// öffentlichen Turnier-Seite (/turnier/[token]) erscheint.
export async function spielDuplikatVerknuepfen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const quellId = formData.get("quellId");
  const rundenspielId = formData.get("rundenspielId");
  if (
    typeof quellId !== "string" ||
    !quellId ||
    typeof rundenspielId !== "string" ||
    !rundenspielId
  ) {
    throw new Error("Termine fehlen.");
  }

  let quellTurnierId: string | null = null;

  await withTenant(vereinId, async (tx) => {
    const [quelle, rundenspiel] = await Promise.all([
      tx.query.termine.findFirst({
        where: and(eq(termine.id, quellId), eq(termine.vereinId, vereinId)),
      }),
      tx.query.termine.findFirst({
        where: and(eq(termine.id, rundenspielId), eq(termine.vereinId, vereinId)),
      }),
    ]);
    if (
      !quelle ||
      quelle.quelle !== "manuell" ||
      (quelle.typ !== "testspiel" && quelle.typ !== "turnier_spiel") ||
      !rundenspiel ||
      rundenspiel.typ !== "rundenspiel"
    ) {
      throw new Error("Termine nicht gefunden oder nicht verknüpfbar.");
    }
    quellTurnierId = quelle.turnierId;

    const [bestehendeZuordnungen, quellZuordnungen] = await Promise.all([
      tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.terminId, rundenspielId),
      }),
      tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.terminId, quellId),
      }),
    ]);

    for (const z of quellZuordnungen) {
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

    if (quellTurnierId) {
      await tx
        .update(termine)
        .set({ turnierId: quellTurnierId })
        .where(eq(termine.id, rundenspielId));
    }

    await tx.delete(termine).where(eq(termine.id, quellId));
  });

  revalidatePath("/admin/termine");
  if (quellTurnierId) {
    revalidatePath(`/admin/termine/${quellTurnierId}`);
    revalidatePath(`/profil/turnier/${quellTurnierId}`);
  }
}

// ---------------------------------------------------------------------------
// Turnier-Spielplan: einzelne Spiele innerhalb eines Turnier-Containers
// (termine.typ = "turnier"). Dienste-Bedarf (Ordner/Kiosk/Kassierer) gilt weiterhin
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

// Für Drag & Drop im Spielplan (siehe TurnierSpielplan): vertauscht den
// Zeitslot (Start + Ort) zweier Einzelspiele, damit man die Reihenfolge
// ändern kann, ohne beide Startzeiten manuell nachzurechnen. Begegnung und
// Ergebnis bleiben an der jeweiligen Zeile hängen — es wandert also die
// Begegnung an eine andere Uhrzeit/Bahn, nicht umgekehrt.
export async function turnierSpieleVertauschen(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;

  const turnierId = formData.get("turnierId");
  const spielIdA = formData.get("spielIdA");
  const spielIdB = formData.get("spielIdB");
  if (typeof turnierId !== "string" || !turnierId) {
    throw new Error("Turnier fehlt.");
  }
  if (
    typeof spielIdA !== "string" ||
    !spielIdA ||
    typeof spielIdB !== "string" ||
    !spielIdB
  ) {
    throw new Error("Spiele fehlen.");
  }
  if (spielIdA === spielIdB) return;

  await withTenant(vereinId, async (tx) => {
    await ladeTurnierContainer(tx, turnierId, vereinId, session);

    const spielWhere = (terminId: string) =>
      and(
        eq(termine.id, terminId),
        eq(termine.vereinId, vereinId),
        eq(termine.typ, "turnier_spiel"),
        eq(termine.turnierId, turnierId)
      );
    const [a, b] = await Promise.all([
      tx.query.termine.findFirst({ where: spielWhere(spielIdA) }),
      tx.query.termine.findFirst({ where: spielWhere(spielIdB) }),
    ]);
    if (!a || !b) throw new Error("Spiel nicht gefunden.");

    await tx
      .update(termine)
      .set({ start: b.start, ort: b.ort })
      .where(eq(termine.id, a.id));
    await tx
      .update(termine)
      .set({ start: a.start, ort: a.ort })
      .where(eq(termine.id, b.id));
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
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const turnierId = formData.get("turnierId");
  if (typeof turnierId !== "string" || !turnierId) {
    throw new Error("Turnier fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    await ladeTurnierContainer(tx, turnierId, vereinId, session);
    const vereinRow = await tx.query.vereine.findFirst({
      where: (v, { eq }) => eq(v.id, vereinId),
    });
    await tx
      .update(termine)
      .set({ freigabeToken: generiereOeffentlichenToken(vereinRow?.name ?? "") })
      .where(eq(termine.id, turnierId));
  });

  revalidatePath(`/admin/termine/${turnierId}`);
}

export async function mannschaftAusRundenspielAnlegen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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

  revalidatePath("/admin/termine");
  revalidatePath("/admin/mannschaften");
}

// Gegenstück zu mannschaftAusRundenspielAnlegen: der Vorschlag betrifft meist
// eine fremde Mannschaft (siehe Hinweis auf /admin/termine (Hallenspielplan-Tab)) und soll bei
// künftigen Imports nicht wieder auftauchen — siehe ignorierteMannschaften in
// schema.ts.
export async function unbekannteMannschaftAblehnen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name fehlt.");
  }
  const kategorieRoh = formData.get("kategorie");
  const kategorie =
    typeof kategorieRoh === "string" && kategorieRoh ? kategorieRoh : null;

  await withTenant(vereinId, (tx) =>
    tx
      .insert(ignorierteMannschaften)
      .values({
        vereinId,
        normalisierterName: normalisiereMannschaftsname(name),
        kategorie,
      })
      .onConflictDoNothing()
  );

  revalidatePath("/admin/termine");
}

// Macht eine Ablehnung (siehe unbekannteMannschaftAblehnen oben) rückgängig —
// der Vorschlag kann danach wieder unter "Unbekannte Mannschaften" auftauchen
// (falls noch unverknüpfte Termine dafür bestehen), und dessen Termine zählen
// wieder als offene Dienste (siehe istMannschaftIgnoriert in dashboard.ts).
export async function ignorierteMannschaftReaktivieren(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Id fehlt.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .delete(ignorierteMannschaften)
      .where(
        and(eq(ignorierteMannschaften.id, id), eq(ignorierteMannschaften.vereinId, vereinId))
      )
  );

  revalidatePath("/admin/termine");
  revalidatePath("/admin");
  revalidatePath("/admin/dienste");
}

const MANNSCHAFT_BEDARF_ROLLEN = ["ordner", "kioskdienst", "kassierer", "zeitnehmer"] as const;

// Admin-Pendant zu ordnerMannschaftenBedarfSetzen (profil/ordnerwart/actions.ts)
// und zeitnehmerMannschaftBedarfUmschalten (profil/zeitnehmerwart/actions.ts) —
// dort jeweils nur für Inhaber der passenden Wart-Rolle nutzbar. Gibt dem
// Vereinsadmin (der nicht zwingend selbst eine dieser Wart-Rollen hat) eine
// zentrale Übersicht über ALLE vier Rollen auf einmal (siehe
// /admin/mannschaften), statt zwischen den Wart-Seiten wechseln zu müssen.
export async function mannschaftBedarfRolleUmschalten(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const mannschaftId = formData.get("mannschaftId");
  if (typeof mannschaftId !== "string" || !mannschaftId) {
    throw new Error("Mannschaft fehlt.");
  }
  const rolle = formData.get("rolle");
  if (
    typeof rolle !== "string" ||
    !(MANNSCHAFT_BEDARF_ROLLEN as readonly string[]).includes(rolle)
  ) {
    throw new Error("Rolle fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    const mannschaft = await tx.query.mannschaften.findFirst({
      where: and(eq(mannschaften.id, mannschaftId), eq(mannschaften.vereinId, vereinId)),
    });
    if (!mannschaft) throw new Error("Mannschaft nicht gefunden.");

    if (rolle === "ordner") {
      await tx
        .update(mannschaften)
        .set({ ordnerBedarfDeaktiviert: !mannschaft.ordnerBedarfDeaktiviert })
        .where(eq(mannschaften.id, mannschaftId));
    } else if (rolle === "kioskdienst") {
      await tx
        .update(mannschaften)
        .set({ kioskdienstBedarfDeaktiviert: !mannschaft.kioskdienstBedarfDeaktiviert })
        .where(eq(mannschaften.id, mannschaftId));
    } else if (rolle === "kassierer") {
      await tx
        .update(mannschaften)
        .set({ kassiererBedarfDeaktiviert: !mannschaft.kassiererBedarfDeaktiviert })
        .where(eq(mannschaften.id, mannschaftId));
    } else {
      await tx
        .update(mannschaften)
        .set({ zeitnehmerBedarfDeaktiviert: !mannschaft.zeitnehmerBedarfDeaktiviert })
        .where(eq(mannschaften.id, mannschaftId));
    }
  });

  revalidatePath("/admin/mannschaften");
  revalidatePath("/admin/dienste");
  revalidatePath("/admin");
  revalidatePath("/profil/ordnerwart");
  revalidatePath("/profil/zeitnehmerwart");
}
