"use client";

import { useEffect } from "react";
import Link from "next/link";
import { istVersionsFehler } from "@/lib/versions-fehler";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Fängt Fehler ab, die aus Server Actions oder beim Rendern innerhalb
// dieser App geworfen werden (z.B. "Es sind bereits X Zeitnehmer/Sekretäre
// zugeordnet." aus pruefeBesetzungsgrenze) — ohne diesen Boundary zeigt
// Next.js stattdessen die generische "This page couldn't load"-Seite ohne
// Fehlertext und ohne Weg zurück in die App.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Nach einem Deploy: alte Version im offenen Tab -> einmal automatisch neu laden (Schutz vor Schleife über sessionStorage).
  const versionsFehler = istVersionsFehler(error);
  useEffect(() => {
    console.error(error);
    if (!versionsFehler) return;
    try {
      if (sessionStorage.getItem("hp-neu-geladen")) return;
      sessionStorage.setItem("hp-neu-geladen", "1");
    } catch {}
    window.location.reload();
  }, [error, versionsFehler]);

  if (versionsFehler) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center p-6">
        <Card>
          <CardHeader>
            <CardTitle>Neue Version verfügbar</CardTitle>
            <CardDescription>Die App wurde gerade aktualisiert. Bitte lade die Seite neu, dann geht es weiter. Nichts ist verloren.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()}>Seite neu laden</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Etwas ist schiefgelaufen</CardTitle>
          <CardDescription>
            {error.message || "Unbekannter Fehler."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => reset()}>Erneut versuchen</Button>
          <Button variant="outline" render={<Link href="/" />}>
            Zur Übersicht
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
