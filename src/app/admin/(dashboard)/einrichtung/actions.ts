"use server";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { ligaVereine, nuligaVereinsindex, vereine } from "@/db/schema";
import { verbieteImDemo } from "@/lib/demo-verein";
import { fuehreNuligaEinrichtungAus } from "@/lib/nuliga/einrichtung";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { schreibeProtokoll } from "@/lib/treuhand";
import { EINRICHTUNG_UEBERSPRUNGEN_COOKIE, pruefeEinrichtungsEingabe } from "@/lib/selbst-einrichtung";

// Selbst-Einrichtung eines neuen Vereins (Assistent /admin/einrichtung): derselbe Ablauf wie "Automatisch einrichten" des
// Systemadmins (`fuehreNuligaEinrichtungAus`), aber vom Vereinsadmin selbst ausgelöst. Still (keine Mail), nicht zerstörend.
// Nur solange noch keine IDs hinterlegt sind — danach gelten die gesperrten Stammdaten (Änderung nur per Antrag).
export async function selbstEinrichten(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  await verbieteImDemo(session.user.vereinId);
  const vereinId = session.user.vereinId!;

  const roh = (n: string) => {
    const w = formData.get(n);
    return typeof w === "string" ? w : "";
  };
  const eingabe = pruefeEinrichtungsEingabe({
    quelle: roh("quelle"),
    nuligaClubId: roh("nuligaClubId") || roh("nuligaVorschlag"),
    handballNetClubId: roh("handballNetClubId"),
  });
  if ("fehler" in eingabe) redirect(`/admin/einrichtung?fehler=${encodeURIComponent(eingabe.fehler)}`);

  const [verein] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  if (!verein) throw new Error("Verein nicht gefunden.");

  const bestehend = await adminDb.query.ligaVereine.findFirst({ where: eq(ligaVereine.vereinId, vereinId) });
  if (bestehend && (bestehend.nuligaClubId || bestehend.handballNetClubId || bestehend.handballNetTeamIds)) {
    redirect("/admin/einstellungen#oeffentliche-seite");
  }

  const verband = "HHV";
  let indexName = verein.name;
  if (eingabe.nuligaClubId) {
    const belegt = await adminDb.query.ligaVereine.findFirst({
      where: and(eq(ligaVereine.verband, verband), eq(ligaVereine.nuligaClubId, eingabe.nuligaClubId), ne(ligaVereine.vereinId, vereinId)),
      columns: { id: true },
    });
    if (belegt) redirect(`/admin/einrichtung?fehler=${encodeURIComponent("Diese nuLiga-Vereins-ID gehört schon zu einem anderen Verein. Bitte prüfen oder uns über „Feedback“ schreiben.")}`);
    const [eintrag] = await adminDb
      .select({ name: nuligaVereinsindex.name })
      .from(nuligaVereinsindex)
      .where(and(eq(nuligaVereinsindex.verband, verband), eq(nuligaVereinsindex.clubId, eingabe.nuligaClubId)));
    if (eintrag) indexName = eintrag.name;
  }
  if (eingabe.handballNetClubId) {
    const belegt = await adminDb.query.ligaVereine.findFirst({
      where: and(eq(ligaVereine.handballNetClubId, eingabe.handballNetClubId), ne(ligaVereine.vereinId, vereinId)),
      columns: { id: true },
    });
    if (belegt) redirect(`/admin/einrichtung?fehler=${encodeURIComponent("Diese handball.net-Vereins-ID gehört schon zu einem anderen Verein. Bitte prüfen oder uns über „Feedback“ schreiben.")}`);
  }

  const schritte = await fuehreNuligaEinrichtungAus({
    vereinId,
    clubId: eingabe.nuligaClubId,
    handballNetClubId: eingabe.handballNetClubId,
    indexName,
    verband,
  });
  await schreibeProtokoll(
    vereinId,
    "einrichtung_selbst",
    session.user.email ?? session.user.id,
    [eingabe.nuligaClubId && `nuLiga ${eingabe.nuligaClubId}`, eingabe.handballNetClubId && `handball.net ${eingabe.handballNetClubId}`].filter(Boolean).join(", ") +
      ": " +
      schritte.map((x) => `${x.label}: ${x.status}`).join("; ")
  );
  const params = new URLSearchParams({ einrichtung: JSON.stringify({ verein: verein.name, vereinId, schritte }) });
  redirect(`/admin/einrichtung?${params.toString()}`);
}

// "Später": der Assistent leitet die Übersicht dann auf diesem Gerät nicht mehr um (die Karte "Erste Schritte" bleibt).
export async function einrichtungUeberspringen() {
  await requireAdminSchreibzugriff();
  (await cookies()).set(EINRICHTUNG_UEBERSPRUNGEN_COOKIE, "1", {
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
  });
  redirect("/admin");
}
