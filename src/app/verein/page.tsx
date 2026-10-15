import type { Metadata } from "next";
import { FanKopf, FanTheme } from "@/components/liga/fan-rahmen";
import { Vereinsuche } from "@/components/liga/vereinsuche";
import { holeAlleVereine } from "@/lib/liga-oeffentlich";
import { appUrl } from "@/lib/app-url";

export const metadata: Metadata = {
  title: "Handballvereine – Mannschaften, Spielpläne & Ergebnisse | HandballerPate",
  description: "Handballverein suchen und Mannschaften, Spielpläne, Ergebnisse und Tabellen ansehen – kostenlos und ohne Login auf HandballerPate.",
  alternates: { canonical: `${appUrl()}/verein` },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "HandballerPate",
    url: `${appUrl()}/verein`,
    title: "Handballvereine – Mannschaften, Spielpläne & Ergebnisse | HandballerPate",
    description: "Handballverein suchen und Mannschaften, Spielpläne, Ergebnisse und Tabellen ansehen.",
    images: [{ url: "/brand/logo-gross.png", width: 900, height: 634, alt: "HandballerPate" }],
  },
};

export default async function Vereinsuebersicht() {
  const vereine = await holeAlleVereine();
  return (
    <>
      <FanTheme hue={150} />
      <FanKopf titel="Vereine" untertitel="Spielpläne und Ergebnisse im Handball" aktiv="vereine" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">Handballverein finden</h1>
          <p className="text-sm text-muted-foreground">
            Verein auswählen, dann Mannschaft: Spielplan, Ergebnisse und Tabelle ohne Login.
          </p>
        </div>
        {vereine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Vereine freigeschaltet.</p>
        ) : (
          <Vereinsuche vereine={vereine} />
        )}
      </main>
    </>
  );
}
