import { demoJetztZuruecksetzen } from "@/app/demo/actions";
import { SubmitButton } from "@/components/submit-button";
import { darfDemoZuruecksetzen } from "@/lib/demo-konstanten";

// Hinweisleiste im Demo-Verein (Admin- und Profil-Bereich): erinnert daran, dass alles Testdaten sind, und bietet "Jetzt zurücksetzen" an
// (nach dem Zurücksetzen ist der Verein neu angelegt, erstelltAm ist also der Zeitpunkt der letzten Zurücksetzung).
export function DemoBanner({ verein }: { verein: { istDemo: boolean; erstelltAm: Date } | null | undefined }) {
  if (!verein?.istDemo) return null;
  const darfZuruecksetzen = darfDemoZuruecksetzen(verein.erstelltAm);
  return (
    <div className="border-b bg-sky-100 px-4 py-2 text-sm text-sky-950 sm:px-6 dark:bg-sky-950 dark:text-sky-100">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-2">
        <p>
          <strong>Demo mit Testdaten</strong> — alles darf ausprobiert werden, jede Nacht wird zurückgesetzt. Es werden keine E-Mails verschickt.
        </p>
        {darfZuruecksetzen && (
          <form action={demoJetztZuruecksetzen}>
            <SubmitButton size="sm" variant="outline" pendingText="Wird zurückgesetzt…">
              Jetzt zurücksetzen
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
