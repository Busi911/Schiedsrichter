import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine, users, vereinVorschauLinks } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { NeuerVereinDialog } from "@/components/neuer-verein-dialog";
import { VereinVorbereitenDialog } from "@/components/verein-vorbereiten-dialog";
import { VereinUebergebenDialog } from "@/components/verein-uebergeben-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { appUrl } from "@/lib/app-url";
import { VorschauLinks } from "@/components/vorschau-links";
import { istDauerhaft, supportFreigabeAktiv } from "@/lib/treuhand";
import { treuhandStarten } from "./actions";
import { formatDatum as formatDate } from "@/lib/format";

export default async function SystemVereinePage() {
  await requireSystemAdmin();

  // Bewusst adminDb (privilegiert, RLS-frei): der Systemadmin muss
  // vereinsübergreifend sehen können — das ist genau seine Aufgabe.
  const alleVereine = await adminDb.query.vereine.findMany({
    orderBy: (v) => [desc(v.erstelltAm)],
  });
  const admins = await adminDb
    .select({ vereinId: users.vereinId, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.istAdmin, true));

  const slugs = new Map(
    (await adminDb.select({ vereinId: ligaVereine.vereinId, slug: ligaVereine.slug }).from(ligaVereine)).map((z) => [
      z.vereinId,
      z.slug,
    ])
  );
  const vorschauLinks = await adminDb
    .select()
    .from(vereinVorschauLinks)
    .where(and(isNull(vereinVorschauLinks.widerrufenAm), gt(vereinVorschauLinks.gueltigBis, new Date())));
  const basisUrl = appUrl();

  // Vereine in Vorbereitung zuerst (dort ist etwas zu tun), danach die aktiven; jeweils neueste zuerst.
  const sortiert = [...alleVereine].sort(
    (a, b) =>
      Number(b.status === "vorbereitung") - Number(a.status === "vorbereitung") ||
      b.erstelltAm.getTime() - a.erstelltAm.getTime()
  );
  const anzahlVorbereitung = alleVereine.filter((v) => v.status === "vorbereitung").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Vereine</h1>
          <p className="text-sm text-muted-foreground">
            {alleVereine.length} Vereine
            {anzahlVorbereitung > 0 && ` · ${anzahlVorbereitung} in Vorbereitung`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <VereinVorbereitenDialog />
          <NeuerVereinDialog />
        </div>
      </div>

      {alleVereine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Vereine angelegt.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortiert.map((v) => {
            const vereinsAdmins = admins.filter((a) => a.vereinId === v.id);
            const vorbereitung = v.status === "vorbereitung";
            const links = vorschauLinks.filter((l) => l.vereinId === v.id);
            return (
              <Card key={v.id} className="gap-3">
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-heading text-base leading-snug font-semibold [overflow-wrap:anywhere]">
                        {v.name.replaceAll("/", "/\u200b")}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Angelegt {formatDate(v.erstelltAm)}
                      </p>
                    </div>
                    {vorbereitung ? (
                      <Badge variant="outline" className="shrink-0">
                        In Vorbereitung
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        Aktiv
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm">
                    <span className="text-muted-foreground">Admin: </span>
                    {vereinsAdmins.length > 0
                      ? vereinsAdmins.map((a) => a.name ?? a.email).join(", ")
                      : "—"}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    {vorbereitung ? (
                      <>
                        <form action={treuhandStarten}>
                          <input type="hidden" name="vereinId" value={v.id} />
                          <SubmitButton size="sm" variant="outline" pendingText="Öffnet…">
                            Einrichten
                          </SubmitButton>
                        </form>
                        <VereinUebergebenDialog vereinId={v.id} vereinName={v.name} />
                      </>
                    ) : supportFreigabeAktiv(v.supportZugriffBis) ? (
                      <form action={treuhandStarten} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="vereinId" value={v.id} />
                        <SubmitButton size="sm" variant="outline" pendingText="Öffnet…">
                          Support-Zugriff
                        </SubmitButton>
                        <span className="text-xs text-muted-foreground">
                          {istDauerhaft(v.supportZugriffBis)
                            ? "dauerhaft freigegeben"
                            : `freigegeben bis ${formatDate(v.supportZugriffBis)}`}
                        </span>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">Kein Support-Zugriff freigegeben</span>
                    )}
                  </div>

                  {vorbereitung && (
                    <details className="rounded-lg border px-3 py-2" open={links.length > 0}>
                      <summary className="cursor-pointer text-sm font-medium">
                        Vorschau-Link für Interessenten
                        {links.length > 0 && (
                          <span className="font-normal text-muted-foreground"> · {links.length} aktiv</span>
                        )}
                      </summary>
                      <VorschauLinks
                        vereinId={v.id}
                        slug={slugs.get(v.id) ?? null}
                        basisUrl={basisUrl}
                        links={links}
                      />
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
