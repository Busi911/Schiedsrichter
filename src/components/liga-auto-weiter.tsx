"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const WARTEZEIT_S = 10;

// Nach einem Sync, der wegen des Zeitlimits nicht fertig wurde: startet
// nach kurzer Pause denselben Sync automatisch erneut (er setzt dort fort,
// wo er aufgehört hat), bis alles geladen ist. Der Nutzer sieht den
// Countdown und kann abbrechen; die Obergrenze der Wiederholungen liegt
// serverseitig (MAX_AUTO_RUNDEN in der Action).
export function LigaAutoWeiter({
  aktion,
  clubId,
  runde,
}: {
  aktion: (formData: FormData) => Promise<void>;
  clubId: string;
  runde: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [rest, setRest] = useState(WARTEZEIT_S);
  const [abgebrochen, setAbgebrochen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const restRef = useRef(WARTEZEIT_S);

  // Alle State-Änderungen im Timer-Callback (nicht direkt im Effekt).
  useEffect(() => {
    if (abgebrochen || laeuft) return;
    const timer = setInterval(() => {
      restRef.current -= 1;
      setRest(restRef.current);
      if (restRef.current <= 0) {
        clearInterval(timer);
        setLaeuft(true);
        formRef.current?.requestSubmit();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [abgebrochen, laeuft]);

  return (
    <form ref={formRef} action={aktion} className="mt-2 flex flex-wrap items-center gap-3 text-sm">
      <input type="hidden" name="nuligaClubId" value={clubId} />
      <input type="hidden" name="runde" value={runde} />
      {abgebrochen ? (
        <>
          <span>Automatisches Weiterladen angehalten.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => {
              restRef.current = WARTEZEIT_S;
              setRest(WARTEZEIT_S);
              setAbgebrochen(false);
            }}>
            Fortsetzen
          </Button>
        </>
      ) : laeuft ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Lädt weiter von nuLiga… (bis ca. 1 Minute)
        </span>
      ) : (
        <>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Es fehlen noch Daten – lädt automatisch weiter in {rest} s…
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setAbgebrochen(true)}>
            Anhalten
          </Button>
        </>
      )}
    </form>
  );
}
