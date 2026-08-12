"use client";

import { useEffect } from "react";
import Link from "next/link";
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
  useEffect(() => {
    console.error(error);
  }, [error]);

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
