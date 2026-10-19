import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { baueAdminNavigation } from "@/lib/admin-navigation";
import { zaehleUnbesetzteTermine7Tage } from "@/lib/neues-dashboard-daten";
import { WART_ITEMS } from "@/lib/wart-navigation";
import { ICONS } from "@/components/nav-icons";
import { BereichsTasten } from "@/components/neues-dashboard";

// Bereichsseite des neuen App-Designs: eine Gruppe der Admin-Navigation (Spielbetrieb, Dienste, Verein, Auswertung) als große Tasten.
// Die Einträge kommen aus lib/admin-navigation.ts (EINE Quelle), hier steht nur der Hinweistext je Ziel.
const HINWEISE: Record<string, string> = {
  "/admin/termine": "Heim-, Auswärts- und Freundschaftsspiele",
  "/admin/mannschaften": "Mannschaften und Trainer",
  "/admin/trainingsplan": "Wochenplan, Ausfälle, freie Zeiten",
  "/admin/dienste": "alles, was noch fehlt",
  "/admin/funktionstraeger": "Personen mit Rolle im Verein",
  "/admin/vereinstermine": "Sitzungen und Termine mit Zu- und Absage",
  "/admin/mitglieder": "Mitglieder, Anträge und Import",
  "/admin/statistik": "Bilanz je Mannschaft",
  "/admin/auswertung": "Dienste auswerten und exportieren",
};

export default async function BereichPage({ params }: { params: Promise<{ gruppe: string }> }) {
  const { gruppe: gruppenId } = await params;
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const verein = await withTenant(vereinId, (tx) => tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) }));
  const nav = baueAdminNavigation({
    vereinstermine: verein?.vereinstermineAktiv ?? false,
    vereinsverwaltung: verein?.vereinsverwaltungAktiv ?? false,
    warte: session.user.istAdmin ? WART_ITEMS : [],
  });
  const gruppe = nav.gruppen.find((g) => g.id === gruppenId);
  if (!gruppe) notFound();

  const offeneDienste = gruppe.id === "dienste" ? await zaehleUnbesetzteTermine7Tage(vereinId) : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          aria-label="Zurück zum Start"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-card"
        >
          <ChevronLeftIcon className="size-5" aria-hidden />
        </Link>
        <h1 className="font-heading text-2xl font-extrabold">{gruppe.titel}</h1>
      </div>

      {gruppe.id === "dienste" && (
        <div className="flex flex-col gap-2.5 rounded-3xl bg-primary p-5 text-primary-foreground">
          <span className="text-xs font-bold tracking-widest uppercase opacity-90">Nächste 7 Tage</span>
          <p className="flex items-baseline gap-2.5">
            <span className="font-heading text-5xl leading-none font-extrabold">{offeneDienste}</span>
            <span className="text-base opacity-95">{offeneDienste === 1 ? "Termin mit offenen Diensten" : "Termine mit offenen Diensten"}</span>
          </p>
          <Link
            href="/admin/dienste"
            className="mt-1 inline-flex min-h-12 items-center justify-center rounded-xl bg-background px-5 text-base font-semibold text-primary"
          >
            {offeneDienste > 0 && session.user.istAdmin ? "Jetzt einteilen" : "Offene Dienste ansehen"}
          </Link>
        </div>
      )}

      {gruppe.eintraege.some((e) => e.abschnitt) ? (
        // Abschnitte (z.B. "Dienste einteilen") stehen als Zwischenüberschrift, wie im Menü.
        [undefined, ...Array.from(new Set(gruppe.eintraege.map((e) => e.abschnitt).filter(Boolean)))].map((abschnitt) => (
          <section key={abschnitt ?? "allgemein"} className="flex flex-col gap-2.5">
            {abschnitt && <h2 className="font-heading text-lg font-bold">{abschnitt}</h2>}
            <BereichsTasten
              eintraege={gruppe.eintraege
                .filter((e) => e.abschnitt === abschnitt)
                .map((e) => ({ href: e.href, label: e.label, hinweis: HINWEISE[e.href], icon: ICONS[e.icon], badge: e.href === "/admin/dienste" ? offeneDienste : e.badge }))}
            />
          </section>
        ))
      ) : (
        <BereichsTasten
          eintraege={gruppe.eintraege.map((e) => ({ href: e.href, label: e.label, hinweis: HINWEISE[e.href], icon: ICONS[e.icon], badge: e.badge }))}
        />
      )}
    </div>
  );
}
