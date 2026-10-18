"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Client-Komponente für die login-abhängigen Links im Footer.
// Löst den Footer aus der dynamischen Server-Komponente (auth()) heraus:
// der Footer selbst bleibt statisch, nur dieser Teil ist clientseitig.
// Die Session wird über /api/auth/session abgefragt (Auth.js v5 JWT,
// kein DB-Zugriff — nur Cookie-Decoding). Die Links sind nicht
// sicherheitsrelevant: /registrieren und /app-hilfe sind öffentliche
// Seiten, /hilfe leitet ggf. auf /login weiter. Der Session-Check
// steuert nur, welcher Link angezeigt wird.
export function FooterLoginLinks() {
  const [eingeloggt, setEingeloggt] = useState(false);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        setEingeloggt(!!data?.user);
        setGeladen(true);
      })
      .catch(() => setGeladen(true));
  }, []);

  // Vor dem ersten Client-Render: keine Login-abhängigen Links zeigen,
  // um ein Flackern zu vermeiden. Die statischen Links (Vereine,
  // Datenschutz, Impressum) sind immer sichtbar.
  if (!geladen) return null;

  if (eingeloggt) {
    return (
      <Link href="/hilfe" className="inline-flex min-h-11 items-center underline">
        Hilfe
      </Link>
    );
  }

  return (
    <>
      <Link href="/app-hilfe" className="inline-flex min-h-11 items-center underline">
        Hilfe zur App
      </Link>
      <Link href="/registrieren" className="inline-flex min-h-11 items-center underline">
        Verein registrieren
      </Link>
    </>
  );
}
