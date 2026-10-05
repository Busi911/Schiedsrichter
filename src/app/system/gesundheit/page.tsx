import { AlertCircle, CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { requireSystemAdmin } from "@/lib/session";
import { holeVereinsGesundheit } from "@/lib/verein-gesundheit";
import { vorZeit, type Lebenszeichen } from "@/lib/verein-gesundheit-bewertung";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Wer ist gerade da, lebt der Verein, ist er korrekt eingerichtet — nur Kennzahlen und Zeitstempel, keine Vereinsinhalte.
export const dynamic = "force-dynamic";

const LEBENSZEICHEN: Record<Lebenszeichen, { label: string; klasse: string; icon: typeof CheckCircle2 }> = {
  lebt: { label: "Lebt", klasse: "bg-emerald-700 text-white", icon: CheckCircle2 },
  ruhig: { label: "Ruhig", klasse: "bg-amber-600 text-white", icon: MinusCircle },
  inaktiv: { label: "Inaktiv", klasse: "bg-red-700 text-white", icon: AlertCircle },
  nie: { label: "Nie benutzt", klasse: "bg-red-700 text-white", icon: AlertCircle },
};

export default async function GesundheitPage() {
  await requireSystemAdmin();
  const jetzt = new Date();
  const { vereine, online } = await holeVereinsGesundheit(jetzt);
  const aktive = vereine.filter((v) => v.status === "aktiv");
  const anzahl = (z: Lebenszeichen) => aktive.filter((v) => v.lebenszeichen === z).length;
  // Wer Aufmerksamkeit braucht, zuerst: inaktiv/nie, dann ruhig, dann lebt; innerhalb davon unvollständige Einrichtung zuerst.
  const rang: Record<Lebenszeichen, number> = { nie: 0, inaktiv: 1, ruhig: 2, lebt: 3 };
  const sortiert = [...vereine].sort(
    (a, b) =>
      Number(b.status === "vorbereitung") - Number(a.status === "vorbereitung") ||
      rang[a.lebenszeichen] - rang[b.lebenszeichen] ||
      a.punkte.filter((p) => p.erfuellt).length - b.punkte.filter((p) => p.erfuellt).length
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Vereins-Gesundheit</h1>
        <p className="text-sm text-muted-foreground">
          Lebt der Verein, und ist er korrekt eingerichtet? „Lebt“ = Aktivität in den letzten 7 Tagen, „Ruhig“ bis 30 Tage,
          „Online“ = in den letzten 5 Minuten aktiv. Nur Kennzahlen und Zeitstempel, keine Inhalte.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Gerade online</CardDescription>
            <CardTitle className="text-3xl">{online.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Aktive Vereine, die leben</CardDescription>
            <CardTitle className="text-3xl">
              {anzahl("lebt")}
              <span className="text-base font-normal text-muted-foreground"> / {aktive.length}</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Ruhig</CardDescription>
            <CardTitle className="text-3xl">{anzahl("ruhig")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Inaktiv / nie benutzt</CardDescription>
            <CardTitle className="text-3xl">{anzahl("inaktiv") + anzahl("nie")}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerade online</CardTitle>
          <CardDescription>Personen mit Aktivität in den letzten 5 Minuten.</CardDescription>
        </CardHeader>
        <CardContent>
          {online.length === 0 ? (
            <p className="text-sm text-muted-foreground">Gerade ist niemand online.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {online.map((p) => (
                <li key={p.email} className="flex flex-wrap items-center gap-x-2">
                  <span className="size-2 rounded-full bg-emerald-600" aria-hidden />
                  <span className="font-medium">{p.name ?? p.email}</span>
                  <span className="text-muted-foreground">
                    {p.vereinName}
                    {p.istAdmin ? " · Vereinsadmin" : ""} · {vorZeit(p.zuletzt, jetzt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {sortiert.map((v) => {
          const k = v.kennzahlen;
          const z = LEBENSZEICHEN[v.lebenszeichen];
          const Icon = z.icon;
          const erfuellt = v.punkte.filter((p) => p.erfuellt).length;
          return (
            <Card key={v.id} className="gap-3">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-heading text-base leading-snug font-semibold [overflow-wrap:anywhere]">{v.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {v.status === "vorbereitung" ? "In Vorbereitung · " : ""}
                      Zuletzt aktiv: {vorZeit(k.letzteAktivitaet, jetzt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${z.klasse}`}
                  >
                    <Icon className="size-3" aria-hidden />
                    {z.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="font-heading text-lg font-semibold">{k.personen}</p>
                    <p className="text-[11px] text-muted-foreground">Personen ({k.admins} Admin)</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="font-heading text-lg font-semibold">
                      {k.angemeldet}
                      <span className="text-xs font-normal text-muted-foreground">/{k.personen}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">schon angemeldet</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="font-heading text-lg font-semibold">{k.onlineJetzt}</p>
                    <p className="text-[11px] text-muted-foreground">online jetzt</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {k.mitRolle} mit Rolle · {k.mannschaften} Mannschaften · {k.kuenftigeTermine} künftige Termine ·{" "}
                  {k.zuordnungen30Tage} Einteilungen (±30 Tage)
                </p>

                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">Einrichtung</span>
                    <Badge variant={erfuellt === v.punkte.length ? "secondary" : "outline"}>
                      {erfuellt}/{v.punkte.length}
                    </Badge>
                  </div>
                  <ul className="flex flex-col gap-0.5 text-xs">
                    {v.punkte.map((p) => (
                      <li key={p.schluessel} className="flex items-center gap-1.5">
                        {p.erfuellt ? (
                          <CheckCircle2 className="size-3.5 text-emerald-700 dark:text-emerald-500" aria-hidden />
                        ) : (
                          <Circle className="size-3.5 text-red-700 dark:text-red-500" aria-hidden />
                        )}
                        <span className={p.erfuellt ? "text-muted-foreground" : "font-medium"}>
                          {p.label}
                          {p.erfuellt ? "" : " — fehlt"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
