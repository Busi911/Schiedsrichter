import type { Metadata } from "next";

// Eigenes PWA-Icon/App-Name, siehe Kommentar bei gleichnamigem metadata-Export
// in src/app/admin/layout.tsx — hier für /profil/zeitnehmerwart.
export const metadata: Metadata = {
  title: "HandballerPate Zeitnehmerwart",
  manifest: "/manifest-zeitnehmerwart.json",
  icons: {
    apple: "/icons/zeitnehmerwart-apple.png",
  },
};

export default function ZeitnehmerwartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
