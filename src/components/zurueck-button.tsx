"use client";

import { useRouter } from "next/navigation";

// Führt zur vorherigen Seite zurück (Browser-Historie) statt zu einem fest
// verdrahteten Ziel — /hilfe wird von ganz unterschiedlichen Stellen aus
// verlinkt (Profil, Admin, System, Footer), ein festes Linkziel wie
// vormals "Zurück zum Login" passte daher nur für einen Teil der Aufrufer.
// fallbackHref greift nur, wenn es (z.B. bei direkt geöffnetem Link ohne
// eigene Vorgeschichte) gar keine vorherige Seite in der Historie gibt.
export function ZurueckButton({
  fallbackHref = "/",
}: {
  fallbackHref?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="text-sm text-muted-foreground underline"
    >
      ← Zurück
    </button>
  );
}
