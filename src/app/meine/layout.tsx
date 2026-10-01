import type { Metadata, Viewport } from "next";
import { FanKopf, FanTheme } from "@/components/liga/fan-rahmen";

// Fan-Web-App "Meine Mannschaften": eigenes Manifest (Name, Startseite) und
// grünes Erscheinungsbild, unabhängig von der Funktionsträger-App.
export const metadata: Metadata = {
  title: "Meine Mannschaften | Handballerpate",
  description: "Spielpläne und Ergebnisse deiner Lieblingsmannschaften.",
  manifest: "/meine/manifest.webmanifest",
  robots: { index: false },
  appleWebApp: { capable: true, title: "Mannschaften", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#14532d" };

export default function MeineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fan flex flex-1 flex-col">
      <FanTheme hue={150} />
      <FanKopf titel="Meine Mannschaften" untertitel="Deine Favoriten auf einen Blick" aktiv="meine" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
