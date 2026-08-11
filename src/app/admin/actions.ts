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
  const typ = formData.get("typ");
  const mannschaftId = formData.get("mannschaftId");

  if (typeof email !== "string" || !email.trim()) {
    throw new Error("E-Mail ist erforderlich.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }
  if (
    typeof typ !== "string" ||
    !(FUNKTIONSTRAEGER_TYPEN as readonly string[]).includes(typ)
  ) {
    throw new Error("Ungültiger Funktionsträger-Typ.");
  }
  const normalizedEmail = email.trim().toLowerCase();

  await withTenant(vereinId, async (tx) => {
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

    await tx.insert(funktionstraegerRollen).values({
      userId: user.id,
      typ: typ as (typeof FUNKTIONSTRAEGER_TYPEN)[number],
      mannschaftId:
        typ === "trainer" && typeof mannschaftId === "string" && mannschaftId
          ? mannschaftId
          : null,
    });
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

  const buffer = Buffer.from(await datei.arrayBuffer());
  const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);
  const fehlerListe = fehler.map((f) => `Zeile ${f.zeilenNr}: ${f.grund}`);

  let angelegt = 0;
  let uebersprungen = 0;

  await withTenant(vereinId, async (tx) => {
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
      });
      angelegt++;
    }
  });

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
    })
  );

  revalidatePath("/admin/termine");
}
