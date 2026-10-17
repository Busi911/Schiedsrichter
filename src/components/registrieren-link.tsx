"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Client-Komponente für den "Verein registrieren"-Link im Footer. Prüft
// beim Mounten via /api/auth/session (Auth.js v5 Standard-Endpunkt, siehe
// src/app/api/auth/[...nextauth]/route.ts), ob der Besucher eingeloggt ist.
// Wenn ja, wird der Link ausgeblendet — wer bereits in einem Verein ist,
// braucht keine Registrierung.
//
// Warum clientseitig: Der Footer ist eine statische Server-Komponente
// (kein auth()-Aufruf), damit öffentliche Seiten statisch vorgerendert
// werden können. SessionProvider/useSession wird im Projekt nicht verwendet
// (kein Provider im Root-Layout), daher der fetch-basierte Check.
//
// Der Link ist beim ersten Rendern sichtbar (kein Flackern für nicht-
// eingeloggte Besucher, die Mehrheit). Eingeloggte Besucher sehen ihn
// kurz und er verschwindet nach dem Session-Check — akzeptiert, weil
// der Footer weit unten steht und der Link nicht kritisch ist.
export function RegistrierenLink() {
  const [eingeloggt, setEingeloggt] = useState(false);

  useEffect(() => {
    let aktiv = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (aktiv && s?.user) setEingeloggt(true);
      })
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, []);

  if (eingeloggt) return null;

  return (
    <Link
      href="/registrieren"
      className="inline-flex min-h-11 items-center underline"
    >
      Verein registrieren
    </Link>
  );
}
