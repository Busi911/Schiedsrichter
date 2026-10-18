import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ladeBeitrittsSeite } from "@/lib/beitritt-daten";
import { BeitrittFormular } from "./beitritt-formular";

type Props = { params: Promise<{ slug: string }> };

// Öffentliche Seite, ohne Anmeldung; nicht für Suchmaschinen (persönliche Angaben werden erfasst, kein Inhalt zum Finden).
export const metadata: Metadata = { title: "Mitglied werden", robots: { index: false, follow: false } };

// Nur sichtbar, wenn der Verein das Add-on Vereinsverwaltung hat UND den Online-Beitritt eingeschaltet hat (Einstellungen → Online-Beitritt), sonst 404.
export default async function BeitrittSeite({ params }: Props) {
  const { slug } = await params;
  const seite = await ladeBeitrittsSeite(slug);
  if (!seite) notFound();
  return (
    <div className="mx-auto w-full max-w-xl pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Mitglied werden beim {seite.vereinName}</CardTitle>
          <CardDescription>Fülle das Formular aus. Der Verein prüft deinen Antrag und meldet sich per E-Mail bei dir.</CardDescription>
        </CardHeader>
        <CardContent>
          <BeitrittFormular slug={seite.slug} vereinName={seite.vereinName} satzungUrl={seite.satzungUrl} mannschaften={seite.mannschaften.map((m) => ({ id: m.id, name: m.name }))} />
        </CardContent>
      </Card>
    </div>
  );
}
