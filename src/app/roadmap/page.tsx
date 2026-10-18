import Link from "next/link";
import { ZurueckButton } from "@/components/zurueck-button";
import { ROADMAP, ROADMAP_STAND, STATUS_LABEL, type RoadmapStatus } from "@/lib/roadmap";

export const metadata = {
  title: "Roadmap – HandballerPate",
  description:
    "Woran wir arbeiten: stabile Vereins-App mit aktuellen Spielen und Ergebnissen, Funktionsträger- und Terminverwaltung, und was danach kommen könnte.",
  alternates: { canonical: "/roadmap" },
};

const STATUS_KLASSE: Record<RoadmapStatus, string> = {
  fertig: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  in_arbeit: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  geplant: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  idee: "bg-muted text-muted-foreground",
};

function formatiereStand(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

// Öffentlich (ohne Login, siehe publicRoutes in src/proxy.ts). Inhalt: src/lib/roadmap.ts (dort Status und Stand pflegen).
export default function RoadmapPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <ZurueckButton fallbackHref="/" />
      </div>
      <h1 className="font-heading text-2xl font-semibold">Roadmap</h1>
      <p className="text-sm text-muted-foreground">
        Woran wir gerade arbeiten und was danach kommen könnte. Die App ist in der Beta, die Beta endet am 30.11.2026. Wir halten diese Seite aktuell.
        Stand: {formatiereStand(ROADMAP_STAND)}.
      </p>

      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Legende">
        {(Object.keys(STATUS_LABEL) as RoadmapStatus[]).map((s) => (
          <li key={s} className={`rounded-full px-2.5 py-1 font-medium ${STATUS_KLASSE[s]}`}>
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>

      {ROADMAP.map((phase) => (
        <section key={phase.id} id={phase.id} className="flex flex-col gap-3 scroll-mt-6">
          <div>
            <h2 className="font-heading text-lg font-medium">{phase.titel}</h2>
            <p className="text-xs font-medium text-muted-foreground">{phase.zeitraum}</p>
          </div>
          <p className="text-sm text-muted-foreground">{phase.ziel}</p>
          <ul className="flex flex-col gap-2">
            {phase.punkte.map((p) => (
              <li key={p.titel} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{p.titel}</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_KLASSE[p.status]}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
                {p.text ? <p className="mt-1 text-sm text-muted-foreground">{p.text}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <h2 className="font-heading text-base font-medium text-foreground">Wunsch oder Fehler melden</h2>
        <p>
          Etwas fehlt oder stimmt nicht? Schreibt uns an{" "}
          <a href="mailto:info@deweconsulting.de" className="underline">
            info@deweconsulting.de
          </a>
          . Hilfe zur App findet ihr unter{" "}
          <Link href="/app-hilfe" className="underline">
            Hilfe zur App
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
