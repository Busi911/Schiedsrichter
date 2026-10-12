import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDb } from "@/db/admin";
import { mannschaften, vereine } from "@/db/schema";
import { KopfLogo } from "@/components/kopf-logo";
import { holeVereinsLogoInfo } from "@/lib/vereins-logo";
import { TrainerEintragenFormular } from "./formular";

// Token-Seite: nie in Suchmaschinen/KI-Antworten (zusätzlich zu robots.txt).
export const metadata: Metadata = { title: "Als Trainer eintragen", robots: { index: false, follow: false } };

// Öffentlicher, login-freier Link pro Mannschaft: Kenntnis des Tokens ist die Berechtigung. Die Eintragung bleibt inaktiv, bis der Admin freischaltet.
export default async function TrainerEintragenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const mannschaft = await adminDb.query.mannschaften.findFirst({ where: eq(mannschaften.trainerEinladungToken, token) });
  if (!mannschaft) notFound();
  const verein = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, mannschaft.vereinId) });
  if (!verein) notFound();

  const vereinsLogo = await holeVereinsLogoInfo(verein.id);
  const mannschaftName = mannschaft.altersklasse ? `${mannschaft.name} (${mannschaft.altersklasse})` : mannschaft.name;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <KopfLogo logo={vereinsLogo} className="size-12" />
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{verein.name}</p>
          <h1 className="font-heading text-2xl font-semibold">Als Trainer eintragen</h1>
        </div>
      </div>
      <p className="text-base text-muted-foreground">
        Du trainierst <strong>{mannschaftName}</strong>? Trag dich hier ein. Kein Login nötig — der Vereinsadmin schaltet dich danach frei und du
        bekommst deinen Zugang per Mail.
      </p>
      <TrainerEintragenFormular token={token} mannschaftName={mannschaftName} />
    </main>
  );
}
