import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Footer } from "@/components/footer";
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
  title: "HandballerPate",
  description: "Verwaltungsplattform für Funktionsträger im Handballverein",
  manifest: "/manifest.json",
  // Favicon selbst kommt bereits automatisch aus src/app/icon.svg (Next.js
  // Metadata-File-Convention) — hier nur das Apple-Touch-Icon ergänzt, für
  // das es keine entsprechende Datei-Konvention mit diesem Namen gibt.
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Passt Browser-UI (z.B. Statusleiste bei installierter PWA) an den
  // Dark-Mode an, der ausschließlich der System-Einstellung folgt (siehe
  // globals.css) — kein manueller Umschalter in der App.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-muted/40">
        <ServiceWorkerRegistrar />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
