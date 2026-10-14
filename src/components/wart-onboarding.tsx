import Link from "next/link";
import { cookies } from "next/headers";
import { CheckCircle2, Circle, Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { wartOnboardingAusblenden } from "@/app/profil/wart-onboarding-actions";
import { WART_ONBOARDING_COOKIE, wartOnboardingOffen, wartSchritte, wartTitel, type WartRolle, type WartStand } from "@/lib/wart-onboarding";

// "So legst du los": kurze Karte ganz oben auf jeder Wart-Seite (lib/wart-onboarding.ts). Haken kommen aus den Daten der Seite, die Karte
// verschwindet von selbst, wenn alles erledigt ist, oder per "Ausblenden" (Cookie, nur dieses Gerät). Serverkomponente, kein Client-JS.
export async function WartOnboarding({ rolle, stand }: { rolle: WartRolle; stand: WartStand }) {
  const schritte = wartSchritte(rolle, stand);
  if (!wartOnboardingOffen(schritte)) return null;
  const ausgeblendet = ((await cookies()).get(WART_ONBOARDING_COOKIE)?.value ?? "").split(",").includes(rolle);
  if (ausgeblendet) return null;

  const mitHaken = schritte.filter((s) => s.erledigt !== null);
  const erledigt = mitHaken.filter((s) => s.erledigt).length;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">
          So legst du als {wartTitel(rolle)} los ({erledigt} von {mitHaken.length})
        </CardTitle>
        <CardDescription>
          Wenige Schritte, dann läuft es. Die Haken setzen sich von selbst, sobald etwas erledigt ist.{" "}
          <Link href="/hilfe#warte" className="font-medium underline">
            Mehr in der Hilfe
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol className="flex flex-col gap-3">
          {schritte.map((s) => (
            <li key={s.schluessel} className="flex items-start gap-3">
              {s.erledigt === null ? (
                <Lightbulb className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              ) : s.erledigt ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-500" aria-label="erledigt" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="offen" />
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className={`text-sm font-medium ${s.erledigt ? "text-muted-foreground line-through" : ""}`}>{s.titel}</p>
                <p className="text-sm text-muted-foreground">{s.text}</p>
                <div className="flex flex-wrap gap-x-4">
                  {s.href && s.erledigt !== true && (
                    <Link href={s.href} className="inline-flex min-h-11 items-center text-sm font-medium underline">
                      {s.href.startsWith("#") ? "Zur Stelle auf dieser Seite" : "Jetzt öffnen"}
                    </Link>
                  )}
                  <Link href={`/hilfe#${s.hilfeAnker}`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline">
                    Hilfe dazu
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <form action={wartOnboardingAusblenden}>
          <input type="hidden" name="rolle" value={rolle} />
          <SubmitButton variant="ghost" className="h-11 px-4 text-sm" pendingText="…">
            Ausblenden
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
