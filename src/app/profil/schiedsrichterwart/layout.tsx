import type { Metadata } from "next";

// Eigenes PWA-Icon/App-Name, siehe Kommentar bei gleichnamigem metadata-Export
// in src/app/admin/layout.tsx — hier für /profil/schiedsrichterwart, damit
// diese Wart-Rolle eine eigene Identität bekommt statt der generischen
// HandballerPate-App bzw. der von src/app/profil/layout.tsx.
export const metadata: Metadata = {
  title: "HandballerPate Schiedsrichterwart",
  manifest: "/manifest-schiedsrichterwart.json",
  icons: {
    apple: "/icons/schiedsrichterwart-apple.png",
  },
};

export default function SchiedsrichterwartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
