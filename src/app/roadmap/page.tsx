import type { Metadata } from "next";
import Link from "next/link";
import { ZurueckButton } from "@/components/zurueck-button";
import { ROADMAP, ROADMAP_STAND, STATUS_LABEL, type RoadmapPunkt, type RoadmapStatus } from "@/lib/roadmap";

export const metadata: Metadata = {
  title: "Roadmap – HandballerPate",
  description:
    "Woran wir arbeiten: stabile Vereins-App mit aktuellen Spielen und Ergebnissen, Funktionsträger- und Terminverwaltung, und was danach kommen könnte.",
};

const BETA_ENDE = "30.11.2026";

type Status = RoadmapStatus;

const STATUS_CLASS: Record<Status, string> = {
  fertig:
    "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  in_arbeit:
    "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  geplant:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  idee: "bg-muted text-muted-foreground",
};

function Badge({ status }: { status: Status }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Karte({ eintrag }: { eintrag: RoadmapPunkt }) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{eintrag.titel}</h3>
        <Badge status={eintrag.status} />
      </div>
      {eintrag.text && <p className="mt-1 text-sm text-muted-foreground">{eintrag.text}</p>}
    </li>
  );
}

// "2026-10-18" -> "18.10.2026"
function stand(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

export default function RoadmapPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <ZurueckButton fallbackHref="/" />
      </div>
      <h1 className="font-heading text-2xl font-semibold">Roadmap</h1>
      <p className="text-sm text-muted-foreground">
        {`Woran wir gerade arbeiten und was danach kommen könnte. Die App ist in der Beta, die Beta endet am ${BETA_ENDE}. Wir halten diese Seite aktuell. Stand: `}
        {stand(ROADMAP_STAND)}.
      </p>
      <ul
        className="flex flex-wrap gap-2 text-xs"
        aria-label="Legende"
      >
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.fertig}`}>
          {STATUS_LABEL.fertig}
        </li>
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.in_arbeit}`}>
          {STATUS_LABEL.in_arbeit}
        </li>
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.geplant}`}>
          {STATUS_LABEL.geplant}
        </li>
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.idee}`}>
          {STATUS_LABEL.idee}
        </li>
      </ul>
      {ROADMAP.map((abschnitt) => (
        <section
          key={abschnitt.id}
          id={abschnitt.id}
          className="flex flex-col gap-3 scroll-mt-6"
        >
          <div>
            <h2 className="font-heading text-lg font-medium">
              {abschnitt.titel}
            </h2>
            <p className="text-xs font-medium text-muted-foreground">
              {abschnitt.zeitraum}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{abschnitt.ziel}</p>
          <ul className="flex flex-col gap-2">
            {abschnitt.punkte.map((eintrag) => (
              <Karte key={eintrag.titel} eintrag={eintrag} />
            ))}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <h2 className="font-heading text-base font-medium text-foreground">
          Wunsch oder Fehler melden
        </h2>
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
