import Link from "next/link";
import {
  BarChart3Icon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DumbbellIcon,
  FlagIcon,
  UserPlusIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ZEITZONE, formatZeit } from "@/lib/format";
import type { NeuesDashboardDaten } from "@/lib/neues-dashboard-daten";
import type { Aufgabe, ProfilHero } from "@/lib/neues-dashboard";

// Start-Bildschirm im neuen App-Design (Mockup 18.10.2026): Begrüßung, "Heute"-Karte, "Braucht dich" und große Kacheln für die Bereiche.
// Reine Darstellung (Server-Komponente); Daten kommen aus lib/neues-dashboard-daten.ts. Nur Design-Tokens, damit Hell/Dunkel stimmt.

function kurzDatum(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: ZEITZONE }).format(d);
}

const AUFGABEN_TON: Record<Aufgabe["ton"], string> = {
  warnung: "bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950",
  info: "bg-primary text-primary-foreground",
};

export type Kachel = { href: string; label: string; hinweis: string; icon: LucideIcon; badge?: number };

function baueKacheln(d: NeuesDashboardDaten, opt: { vereinsverwaltung: boolean; vereinstermine: boolean }): Kachel[] {
  const kacheln: Kachel[] = [
    {
      href: "/admin/kalender",
      label: "Kalender",
      hinweis: d.naechster ? `${kurzDatum(d.naechster.start)}, ${formatZeit(d.naechster.start)} Uhr als Nächstes` : "Spiele, Training und Termine",
      icon: CalendarDaysIcon,
    },
    {
      href: "/admin/termine",
      label: "Spiele & Turniere",
      hinweis: d.spieleDieseWoche === 0 ? "keine in dieser Woche" : `${d.spieleDieseWoche} in dieser Woche`,
      icon: ClipboardListIcon,
    },
    {
      href: "/admin/mannschaften",
      label: "Mannschaften",
      hinweis: d.mannschaftenAnzahl === 1 ? "1 Mannschaft" : `${d.mannschaftenAnzahl} Mannschaften`,
      icon: UsersRoundIcon,
    },
    {
      href: "/admin/bereich/dienste",
      label: "Dienste",
      hinweis: d.offeneDienste === 0 ? "alles besetzt" : `${d.offeneDienste} offen`,
      icon: ClipboardCheckIcon,
      badge: d.offeneDienste,
    },
    { href: "/admin/trainingsplan", label: "Training", hinweis: "Plan und Ausfälle", icon: DumbbellIcon },
  ];
  if (opt.vereinsverwaltung && d.mitgliederAnzahl !== null) {
    kacheln.push({
      href: "/admin/mitglieder",
      label: "Mitglieder",
      hinweis: d.mitgliederAnzahl === 1 ? "1 Mitglied" : `${d.mitgliederAnzahl} Mitglieder`,
      icon: UserPlusIcon,
    });
  }
  if (opt.vereinstermine) kacheln.push({ href: "/admin/vereinstermine", label: "Vereinstermine", hinweis: "Sitzungen und Termine", icon: FlagIcon });
  kacheln.push({ href: "/admin/statistik", label: "Statistik", hinweis: "Bilanz je Mannschaft", icon: BarChart3Icon });
  return kacheln;
}

function AufgabenKarte({ aufgaben }: { aufgaben: Aufgabe[] }) {
  return (
  <div className="flex flex-col gap-2.5 rounded-3xl border bg-card p-4 md:p-5">
    <div className="flex items-baseline justify-between">
      <h2 className="font-heading text-lg font-bold">Braucht dich</h2>
      <span className="text-sm font-medium text-foreground/70">{aufgaben.length === 0 ? "nichts offen" : aufgaben.length === 1 ? "1 Aufgabe" : `${aufgaben.length} Aufgaben`}</span>
    </div>
    {aufgaben.length === 0 ? (
      <p className="flex items-center gap-2 py-3 text-base text-foreground/75">
        <CheckCircle2Icon className="size-5 shrink-0 text-green-600" aria-hidden />
        Alles erledigt. Nichts wartet auf dich.
      </p>
    ) : (
      <ul className="flex flex-col divide-y">
        {aufgaben.map((a) => (
          <li key={a.schluessel} className="flex min-h-20 flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
            <span
              className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-xl font-extrabold", AUFGABEN_TON[a.ton])}
              aria-hidden
            >
              {a.anzahl}
            </span>
            <div className="min-w-40 flex-1">
              <p className="text-lg leading-tight font-bold">{a.titel}</p>
              <p className="text-base text-foreground/75">{a.hinweis}</p>
            </div>
            <Link
              href={a.href}
              className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {a.aktion}
            </Link>
          </li>
        ))}
      </ul>
    )}
  </div>
  );
}

function KachelGitter({ kacheln }: { kacheln: Kachel[] }) {
  return (
  <div className="flex flex-col gap-3">
    <h2 className="font-heading text-lg font-bold">Bereiche</h2>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {kacheln.map((k) => (
        <Link
          key={k.href}
          href={k.href}
          className="relative flex min-h-24 flex-col gap-2.5 rounded-2xl border bg-card p-3.5 transition-transform active:scale-[0.98] md:p-4"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <k.icon className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block text-base leading-tight font-semibold">{k.label}</span>
            <span className="text-sm text-foreground/75">{k.hinweis}</span>
          </span>
          {!!k.badge && (
            <span
              className="absolute top-3 right-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-sm font-bold text-white"
              aria-label={`${k.badge} offen`}
            >
              {k.badge}
            </span>
          )}
        </Link>
      ))}
    </div>
  </div>
  );
}

export function NeuesDashboard({
  daten,
  gruss,
  vereinName,
  rolle,
  vereinsverwaltung,
  vereinstermine,
}: {
  daten: NeuesDashboardDaten;
  gruss: string;
  vereinName: string;
  rolle: string;
  vereinsverwaltung: boolean;
  vereinstermine: boolean;
}) {
  const { hero } = daten;
  const kacheln = baueKacheln(daten, { vereinsverwaltung, vereinstermine });
  const spiel = hero.spiel;

  return (
    <section aria-label="Start" className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-extrabold">{gruss}</h1>
        <p className="text-sm text-foreground/75">
          {vereinName} · {rolle}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3.5 rounded-3xl bg-primary p-5 text-primary-foreground md:p-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-widest uppercase opacity-90">
              {hero.art === "heute" && spiel ? `Heute · ${kurzDatum(spiel.start)}` : hero.art === "naechstes" && spiel ? `Nächstes Spiel · ${kurzDatum(spiel.start)}` : "Spiele"}
            </span>
            {hero.anzahlHeute > 0 && (
              <span className="rounded-lg bg-white/20 px-2.5 py-1 text-sm font-semibold">
                {hero.anzahlHeute === 1 ? "1 Spiel heute" : `${hero.anzahlHeute} Spiele heute`}
              </span>
            )}
          </div>

          {spiel ? (
            <>
              <div>
                <p className="font-heading text-4xl leading-none font-extrabold md:text-5xl">{formatZeit(spiel.start)} Uhr</p>
                <p className="mt-2 text-base opacity-95">{spiel.titel ?? spiel.mannschaft ?? "Spiel"}</p>
                {(spiel.mannschaft || spiel.ort) && (
                  <p className="text-sm opacity-90">{[spiel.titel ? spiel.mannschaft : null, spiel.ort].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {hero.chips.map((chip) => (
                  <span
                    key={chip.text}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-sm font-semibold",
                      chip.offen ? "bg-amber-100 text-amber-900" : "bg-white/20"
                    )}
                  >
                    {chip.text}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex flex-wrap gap-2.5">
                <Link
                  href={`/admin/termine/${spiel.id}`}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-background px-5 text-base font-semibold text-primary md:w-auto"
                >
                  Zum Spiel
                </Link>
                <Link
                  href="/admin/termine"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white/20 px-5 text-base font-semibold md:w-auto"
                >
                  Alle Spiele
                </Link>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="font-heading text-2xl leading-tight font-extrabold">Keine Spiele in Sicht</p>
                <p className="mt-2 text-base opacity-95">Sobald Spiele angesetzt sind, stehen sie hier.</p>
              </div>
              <Link
                href="/admin/kalender"
                className="mt-auto inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-background px-5 text-base font-semibold text-primary md:w-auto md:self-start"
              >
                Zum Kalender
              </Link>
            </>
          )}
        </div>

        <AufgabenKarte aufgaben={daten.aufgaben} />
      </div>

      <KachelGitter kacheln={kacheln} />
    </section>
  );
}

// Große Tasten für die Bereichsseiten (z.B. /admin/bereich/dienste): ein Eintrag je Zeile, Symbol, Name, Hinweis, Pfeil.
export function BereichsTasten({ eintraege }: { eintraege: { href: string; label: string; hinweis?: string; icon: LucideIcon; badge?: number }[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {eintraege.map((e) => (
        <li key={e.href}>
          <Link
            href={e.href}
            className="flex min-h-[4.25rem] items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 transition-transform active:scale-[0.99]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <e.icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base leading-tight font-semibold">{e.label}</span>
              {e.hinweis && <span className="text-sm text-foreground/75">{e.hinweis}</span>}
            </span>
            {!!e.badge && (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-destructive px-2 text-sm font-bold text-white" aria-label={`${e.badge} offen`}>
                {e.badge}
              </span>
            )}
            <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Persönlicher Start-Bildschirm im neuen App-Design (/profil, für Trainer, Warte, Helfer und alle ohne Admin-Rechte): "Dein nächster Einsatz",
// offene Aufgaben und Kacheln für die Bereiche, die diese Person nutzt. Die bisherigen Karten (Kalender, Termine, Dienste) folgen darunter.
export function NeuesProfilStart({
  gruss,
  vereinName,
  rolleText,
  hero,
  aufgaben,
  kacheln,
}: {
  gruss: string;
  vereinName: string;
  rolleText: string;
  hero: ProfilHero;
  aufgaben: Aufgabe[];
  kacheln: Kachel[];
}) {
  const e = hero.einsatz;
  return (
    <section aria-label="Start" className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-extrabold">{gruss}</h1>
        <p className="text-sm text-foreground/75">
          {vereinName} · {rolleText}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3.5 rounded-3xl bg-primary p-5 text-primary-foreground md:p-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-widest uppercase opacity-90">
              {e ? `${hero.heute ? "Heute" : "Dein nächster Einsatz"} · ${kurzDatum(e.start)}` : "Deine Einsätze"}
            </span>
            {hero.anzahl7Tage > 1 && (
              <span className="rounded-lg bg-white/20 px-2.5 py-1 text-sm font-semibold">{hero.anzahl7Tage} in 7 Tagen</span>
            )}
          </div>
          {e ? (
            <>
              <div>
                <p className="font-heading text-4xl leading-none font-extrabold md:text-5xl">{formatZeit(e.start)} Uhr</p>
                <p className="mt-2 text-base opacity-95">{e.titel ?? "Termin"}</p>
                {e.ort && <p className="text-sm opacity-90">{e.ort}</p>}
              </div>
              {e.rollen.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {e.rollen.map((r) => (
                    <span key={r} className="rounded-lg bg-white/20 px-2.5 py-1 text-sm font-semibold">
                      {r}
                    </span>
                  ))}
                </div>
              )}
              <Link
                href="#meine-termine"
                className="mt-auto inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-background px-5 text-base font-semibold text-primary md:w-auto md:self-start"
              >
                Zu meinen Terminen
              </Link>
            </>
          ) : (
            <>
              <div>
                <p className="font-heading text-2xl leading-tight font-extrabold">Gerade nichts eingetragen</p>
                <p className="mt-2 text-base opacity-95">Sobald du für einen Termin eingeteilt bist, steht er hier.</p>
              </div>
              <Link
                href="#kalender"
                className="mt-auto inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-background px-5 text-base font-semibold text-primary md:w-auto md:self-start"
              >
                Zum Kalender
              </Link>
            </>
          )}
        </div>
        <AufgabenKarte aufgaben={aufgaben} />
      </div>

      <KachelGitter kacheln={kacheln} />
    </section>
  );
}
