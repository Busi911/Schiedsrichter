import type { Metadata } from "next";
import { auth, signOut } from "@/auth";
import { BottomNav, type BottomNavItem } from "@/components/bottom-nav";
import { istSchiedsrichterwart } from "@/lib/schiedsrichterwart";
import { istZeitnehmerwart } from "@/lib/zeitnehmerwart";
import { istOrdnerwart } from "@/lib/ordnerwart";
import { istDienstwart } from "@/lib/dienstwart";
import { sehenTrainingPunkt } from "@/lib/training-sichtbar";
import { DemoBanner } from "@/components/demo-banner";
import { DEMO_VEREIN_ID } from "@/lib/demo-konstanten";
import { holeDemoVerein } from "@/lib/demo-verein";

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

  if (session.user.istAdmin || session.user.istAdminLesend) {
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

// Bottom-Navigation (nur mobil) für alle eingeloggten Personen, damit sie
// überall gleich aussieht — zusätzliche Tabs je nach Rolle: Admin-Bereich
// und/oder Wart-Rollen (Admins haben Zugriff auf alle Wart-Bereiche, siehe
// profil/page.tsx). Ohne solche Rollen steht neben Profil der Hilfe-Tab.
export default async function ProfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const vereinId = session?.user?.vereinId;
  if (!session?.user || !vereinId) return children;

  const userId = session.user.id;
  const istAdmin = session.user.istAdmin;
  const [schiriwart, zeitnehmerwart, ordnerwart] = istAdmin
    ? [true, true, true]
    : await Promise.all([
        istSchiedsrichterwart(vereinId, userId),
        istZeitnehmerwart(vereinId, userId),
        istOrdnerwart(vereinId, userId),
      ]);
  // Dienstwart (eigene Dienste): Admins immer, wie bei den anderen Warten.
  const dienstwart = istAdmin || (await istDienstwart(vereinId, userId));
  // Extra-Punkt "Training": Admins und Trainer immer, alle anderen nur, wenn der Verein ihn freigeschaltet hat.
  const training = await sehenTrainingPunkt(vereinId, userId, istAdmin, !!session.user.istAdminLesend);

  const tabs: BottomNavItem[] = [
    { href: "/profil", label: "Profil", icon: "profil", exact: true },
  ];
  if (istAdmin || session.user.istAdminLesend) {
    tabs.push({ href: "/admin", label: "Admin", icon: "admin" });
  }
  if (schiriwart) {
    tabs.push({ href: "/profil/schiedsrichterwart", label: "Schiris", icon: "wart" });
  }
  if (zeitnehmerwart) {
    tabs.push({ href: "/profil/zeitnehmerwart", label: "Zeitnehmer", icon: "wart" });
  }
  if (ordnerwart) {
    tabs.push({ href: "/profil/ordnerwart", label: "Ordner", icon: "wart" });
  }
  if (dienstwart) {
    tabs.push({ href: "/profil/dienstwart", label: "Dienste", icon: "wart" });
  }
  if (training) {
    tabs.push({ href: "/profil/training", label: "Training", icon: "training" });
  }
  const nurProfil = tabs.length === 1;
  if (nurProfil) tabs.push({ href: "/hilfe", label: "Hilfe", icon: "hilfe" });

  const demoVerein = vereinId === DEMO_VEREIN_ID ? await holeDemoVerein() : null;

  return (
    <>
      <DemoBanner verein={demoVerein} />
      {children}
      <BottomNav
        tabs={tabs}
        mehrItems={[
          { href: "/profil#einstellungen", label: "Einstellungen", icon: "einstellungen" },
          { href: "/profil/passwort-aendern", label: "Passwort ändern", icon: "passwort" },
          ...(nurProfil ? [] : [{ href: "/hilfe", label: "Hilfe", icon: "hilfe" } as const]),
        ]}
        logoutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />
    </>
  );
}
