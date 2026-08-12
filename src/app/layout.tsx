import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  themeColor: "#1c1c1e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-muted/40">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
