"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import { ZAHLUNGSFRIST_TAGE, zahlungsStand } from "@/lib/abrechnung";
import { sendeWeiternutzungBestaetigt } from "@/lib/zahlung-erinnerung";
import { schreibeProtokoll } from "@/lib/treuhand";

// Nach der Testphase: der Vereinsadmin bestätigt ausdrücklich, dass er HandballerPate weiter nutzen möchte (und die angezeigten Konditionen annimmt).
// Erst damit entsteht eine Zahlungspflicht: Zahlungsziel 30 Tage ab heute, Rechnung stellt der Systemadmin (Mail an ihn). Nur der Vereinsadmin selbst,
// nie ein Systemadmin im Treuhand-Kontext, nur für einen Verein, dessen Testphase abgelaufen ist.
export async function weiternutzungBestaetigen() {
  const session = await auth();
  const u = session?.user;
  if (!u?.vereinId || !u.istAdmin || u.treuhand) throw new Error("Nur der Vereinsadmin kann die Weiternutzung bestätigen.");
  const v = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, u.vereinId) });
  if (!v || zahlungsStand(v, new Date()).art !== "testphase_abgelaufen") redirect("/admin");

  const jetzt = new Date();
  await adminDb
    .update(vereine)
    .set({
      weiternutzungBestaetigtAm: jetzt,
      zahlungFaelligAm: new Date(jetzt.getTime() + ZAHLUNGSFRIST_TAGE * 24 * 3600 * 1000),
      zahlungMailMarke: null,
    })
    .where(and(eq(vereine.id, v.id)));
  const wer = u.email ?? u.id ?? "Vereinsadmin";
  await schreibeProtokoll(v.id, "weiternutzung_bestaetigt", wer, "Nach der Testphase: Weiternutzung und Konditionen bestätigt");
  await sendeWeiternutzungBestaetigt(v.id, wer);
  redirect("/admin");
}
