import type { Metadata } from "next";

// Eigenes PWA-Icon/App-Name, siehe Kommentar bei gleichnamigem metadata-Export
// in src/app/admin/layout.tsx — hier für /profil/ordnerwart.
export const metadata: Metadata = {
  title: "HandballerPate Ordnerwart",
  manifest: "/manifest-ordnerwart.json",
  icons: {
    apple: "/icons/ordnerwart-apple.png",
  },
};

export default function OrdnerwartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
