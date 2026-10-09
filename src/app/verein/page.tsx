import type { Metadata } from "next";
import { FanKopf, FanTheme } from "@/components/liga/fan-rahmen";
import { Vereinsuche } from "@/components/liga/vereinsuche";
import { holeAlleVereine } from "@/lib/liga-oeffentlich";
import { appUrl } from "@/lib/app-url";

export const metadata: Metadata = {
  title: "Handballvereine – Mannschaften, Spielpläne & Ergebnisse | HandballerPate",
  description: "Alle Vereine auf HandballerPate mit Mannschaften, Spielplänen und Ergebnissen.",
  alternates: { canonical: `${appUrl()}/verein` },
};

export default async function Vereinsuebersicht() {
  const vereine = await holeAlleVereine();
  return (
    <>
      <FanTheme hue={150} />
      <FanKopf titel="Vereine" untertitel="Spielpläne und Ergebnisse im Handball" aktiv="vereine" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        {vereine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Vereine freigeschaltet.</p>
        ) : (
          <Vereinsuche vereine={vereine} />
        )}
      </main>
    </>
  );
}
