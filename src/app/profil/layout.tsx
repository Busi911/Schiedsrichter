import type { Metadata } from "next";
import { auth } from "@/auth";
import { istSchiedsrichterwart } from "@/lib/schiedsrichterwart";
import { istZeitnehmerwart } from "@/lib/zeitnehmerwart";
import { istOrdnerwart } from "@/lib/ordnerwart";

// /profil ist die gemeinsame Seite für ALLE Funktionsträger-Rollen (Person
// kann gleichzeitig mehrere Rollen haben, siehe Kommentar bei
// istSchiedsrichterwart) — für das PWA-Icon/App-Name braucht es trotzdem
// genau EINE Identität. Priorität: Admin > Wart-Rollen (Reihenfolge unter
// den Warten beliebig, da eine Person selten mehr als eine davon hat) >
// generische HandballerPate-Identität (kein Override, erbt von
// src/app/layout.tsx). Die eigenen /profil/*wart-Unterseiten überschreiben
// das über ihr jeweiliges layout.tsx ohnehin nochmal spezifischer.
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.vereinId) return {};

  if (session.user.istAdmin) {
    return {
      title: "HandballerPate Admin",
      manifest: "/manifest-admin.json",
      icons: { apple: "/icons/admin-apple.png" },
    };
  }

  const vereinId = session.user.vereinId;
  const userId = session.user.id;

  if (await istSchiedsrichterwart(vereinId, userId)) {
    return {
      title: "HandballerPate Schiedsrichterwart",
      manifest: "/manifest-schiedsrichterwart.json",
      icons: { apple: "/icons/schiedsrichterwart-apple.png" },
    };
  }
  if (await istZeitnehmerwart(vereinId, userId)) {
    return {
      title: "HandballerPate Zeitnehmerwart",
      manifest: "/manifest-zeitnehmerwart.json",
      icons: { apple: "/icons/zeitnehmerwart-apple.png" },
    };
  }
  if (await istOrdnerwart(vereinId, userId)) {
    return {
      title: "HandballerPate Ordnerwart",
      manifest: "/manifest-ordnerwart.json",
      icons: { apple: "/icons/ordnerwart-apple.png" },
    };
  }

  return {};
}

export default function ProfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
