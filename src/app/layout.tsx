import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Footer } from "@/components/footer";
import { appUrl } from "@/lib/app-url";
import { ServiceWorkerRegistrar } from "@/components/sw-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Eigenständige Schrift für Überschriften (font-heading, siehe globals.css)
// statt derselben Schrift wie der Fließtext — sonst hebt sich die App
// optisch kaum von einem generischen Admin-Template ab.
const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-heading-google",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  // Absolute Basis für relative Pfade (Canonical, Open-Graph-Bilder) — ohne sie lösen Suchmaschinen/Link-Vorschauen sie falsch auf.
  metadataBase: new URL(appUrl()),
  title: "HandballerPate – Hallenspielplan, Spielplan & Dienste für Handballvereine",
  description:
    "HandballerPate organisiert Handballvereine: Schiedsrichter, Zeitnehmer, Ordner und Kiosk einteilen, Hallenspielplan aus nuLiga und handball.net automatisch übernehmen, Spielpläne und Ergebnisse als App für Spieler und Eltern.",
  applicationName: "HandballerPate",
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "HandballerPate",
    title: "HandballerPate – Dienste, Hallenspielplan und Ergebnisse für Handballvereine",
    description:
      "Schiedsrichter, Zeitnehmer, Ordner und Kiosk einteilen, Hallenspielplan automatisch aus nuLiga und handball.net, Spielpläne und Ergebnisse als App.",
    images: [{ url: "/brand/logo-gross.png", width: 900, height: 634, alt: "HandballerPate" }],
  },
  twitter: { card: "summary_large_image", title: "HandballerPate", description: "Dienste, Hallenspielplan und Ergebnisse für Handballvereine." },
  manifest: "/manifest.json",
  // Favicon selbst kommt bereits automatisch aus src/app/icon.png (Next.js
  // Metadata-File-Convention) — hier nur das Apple-Touch-Icon ergänzt, für
  // das es keine entsprechende Datei-Konvention mit diesem Namen gibt.
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Passt Browser-UI (z.B. Statusleiste bei installierter PWA) an die Geräte-Einstellung an. Wählt jemand manuell
  // Hell/Dunkel gegen die Geräte-Einstellung, bleibt diese Leiste bei der Geräte-Farbe (nur Browser-Chrome).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1e" },
  ],
};

export default function RootLayout({ children }: React.PropsWithChildren) {
  return (
    <html
      lang="de"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <head>
        {/* Vor dem ersten Zeichnen: gespeicherte Wahl (hp-theme = light|dark) oder Geräte-Einstellung. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=matchMedia('(prefers-color-scheme: dark)');var a=function(){var t=localStorage.getItem('hp-theme');document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&m.matches))};a();m.addEventListener('change',a)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col overflow-x-hidden bg-muted/40 [overflow-y:scroll]">
        <ServiceWorkerRegistrar />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
