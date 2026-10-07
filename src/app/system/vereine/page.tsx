import Link from "next/link";
import { and, count, desc, eq, gt, isNull, max } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaVereine, nuligaVereinsindex, users, vereinKontakt, vereinVorschauLinks } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { VereinAnsprechen } from "@/components/verein-ansprechen";
import { ansprachetext, normalisiereInstagram } from "@/lib/verein-ansprache";
import { Card, CardContent } from "@/components/ui/card";
import { NeuerVereinDialog } from "@/components/neuer-verein-dialog";
import { VereinVorbereitenDialog } from "@/components/verein-vorbereiten-dialog";
import { VereinUebergebenDialog } from "@/components/verein-uebergeben-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { appUrl } from "@/lib/app-url";
import { VorschauLinks } from "@/components/vorschau-links";
import { istDauerhaft, supportFreigabeAktiv } from "@/lib/treuhand";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { sucheVereinsindex } from "@/lib/nuliga/vereinsindex";
import { EinrichtungsChecklisteListe, leseEinrichtungsErgebnis } from "@/components/einrichtungs-checkliste";
import { Input } from "@/components/ui/input";
import { formatDatum as formatDate } from "@/lib/format";
import { treuhandStarten, vereinAusNuligaEinrichten, vereinsindexAktualisieren, vorbereitungsVereinLoeschen } from "./actions";

export const maxDuration = 60;

export default async function SystemVereinePage({
  searchParams,
}: {
  searchParams: Promise<{ suche?: string; einrichtung?: string; index?: string }>;
}) {
  await requireSystemAdmin();
  const { suche = "", einrichtung: einrichtungRoh, index: indexMeldung } = await searchParams;
  const einrichtung = leseEinrichtungsErgebnis(einrichtungRoh);
  const treffer = suche.trim().length >= 2 ? await sucheVereinsindex(adminDb, suche) : [];
  const eingerichtet = new Set(
    (await adminDb.select({ id: ligaVereine.nuligaClubId }).from(ligaVereine)).map((z) => z.id).filter(Boolean)
  );
  const [indexInfo] = await adminDb.select({ anzahl: count(), stand: max(nuligaVereinsindex.aktualisiertAm) }).from(nuligaVereinsindex);

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
  const kontakte = new Map((await adminDb.select().from(vereinKontakt)).map((k) => [k.vereinId, k]));
  const mannschaftsAnzahl = new Map(
    (
      await adminDb
        .select({ vereinId: ligaVereine.vereinId, anzahl: count() })
        .from(ligaMannschaften)
        .innerJoin(ligaVereine, eq(ligaVereine.id, ligaMannschaften.ligaVereinId))
        .groupBy(ligaVereine.vereinId)
    ).map((z) => [z.vereinId, z.anzahl])
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


      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold">Verein bei nuLiga (HHV) suchen und einrichten</h2>
          <span className="text-xs text-muted-foreground">
            {indexInfo.anzahl > 0
              ? `${indexInfo.anzahl} Vereine im Index${indexInfo.stand ? `, Stand ${formatDate(indexInfo.stand)}` : ""}`
              : "Index noch leer"}
          </span>
        </div>
        <form className="flex gap-2" action="/system/vereine">
          <Input name="suche" defaultValue={suche} placeholder="z.B. HSG Linden oder Linden" />
          <SubmitButton variant="outline" pendingText="Sucht…">
            Suchen
          </SubmitButton>
        </form>
        {suche.trim().length >= 2 && treffer.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nichts gefunden{indexInfo.anzahl === 0 ? " — der Index ist noch leer, bitte unten aktualisieren." : "."}
          </p>
        )}
        {treffer.length > 0 && (
          <ul className="flex flex-col gap-2">
            {treffer.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{t.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {[t.bezirk, t.nummer && `VNr. ${t.nummer}`, `club ${t.clubId}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {eingerichtet.has(t.clubId) ? (
                  <Badge variant="secondary">schon eingerichtet</Badge>
                ) : (
                  <form action={vereinAusNuligaEinrichten}>
                    <input type="hidden" name="clubId" value={t.clubId} />
                    <SubmitButton size="sm" pendingText="Richtet ein… (bis 1 Min.)">
                      Automatisch einrichten
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={vereinsindexAktualisieren} className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm" variant="outline" pendingText="Lädt Vereinsliste… (bis 1 Min.)">
            Vereinsindex aktualisieren
          </SubmitButton>
          <span className="text-xs text-muted-foreground">sonst täglich automatisch</span>
          <Link href="/system/nuliga-diagnose" className="text-xs underline">
            nuLiga-Diagnose (Hallen/Logo)
          </Link>
        </form>
        {indexMeldung && <p className="text-xs text-muted-foreground">Index: {indexMeldung}</p>}
      </section>

      {einrichtung && (
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-heading text-base font-semibold">Automatische Einrichtung: {einrichtung.verein}</h2>
          <EinrichtungsChecklisteListe schritte={einrichtung.schritte} />
          {einrichtung.vereinId && /^[0-9a-f-]{36}$/i.test(einrichtung.vereinId) && (
            <form action={treuhandStarten}>
              <input type="hidden" name="vereinId" value={einrichtung.vereinId} />
              <SubmitButton size="sm" pendingText="Öffnet…">
                Jetzt prüfen und ergänzen (Einrichten)
              </SubmitButton>
            </form>
          )}
          <p className="text-xs text-muted-foreground">
            ✓ automatisch geklappt · ! bitte prüfen · ✕ fehlgeschlagen. Der Verein ist in Vorbereitung (unsichtbar, keine Mails).
          </p>
        </section>
      )}

      {alleVereine.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Vereine angelegt.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortiert.map((v) => {
            const vereinsAdmins = admins.filter((a) => a.vereinId === v.id);
            const vorbereitung = v.status === "vorbereitung";
            const links = vorschauLinks.filter((l) => l.vereinId === v.id);
            const kontakt = kontakte.get(v.id);
            // Längster noch gültiger Link: er steht in der Nachricht, damit er möglichst lange hält.
            const linkFuerText = [...links].sort((a, b) => b.gueltigBis.getTime() - a.gueltigBis.getTime())[0];
            const ansprache = linkFuerText && slugs.get(v.id)
              ? ansprachetext({
                  vereinsname: v.name,
                  vorschauUrl: `${basisUrl}/verein/${slugs.get(v.id)}/vorschau/${linkFuerText.token}`,
                  gueltigBis: linkFuerText.gueltigBis,
                                  })
              : null;
            const ansprachHinweise = [
              (mannschaftsAnzahl.get(v.id) ?? 0) === 0 ? "Noch keine Mannschaften geladen — den Verein erst fertig einrichten." : null,
              linkFuerText && linkFuerText.gueltigBis.getTime() - new Date().getTime() < 2 * 24 * 3600 * 1000 ? "Der Vorschau-Link läuft in weniger als 2 Tagen ab — besser einen neuen mit 7 Tagen erzeugen." : null,
            ].filter((h): h is string => !!h);
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

                  <div className="text-sm">
                    <span className="text-muted-foreground">{vereinsAdmins.length > 1 ? "Admins:" : "Admin:"} </span>
                    {vereinsAdmins.length > 0 ? (
                      <ul className="mt-0.5 flex flex-col gap-0.5">
                        {vereinsAdmins.map((a) => (
                          <li key={a.email} className="[overflow-wrap:anywhere]">
                            {a.name && <span>{a.name} · </span>}
                            <a href={`mailto:${a.email}`} className="underline underline-offset-2 hover:text-primary">
                              {a.email}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </div>

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
                        <form action={vorbereitungsVereinLoeschen}>
                          <input type="hidden" name="vereinId" value={v.id} />
                          <ConfirmSubmitButton
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            pendingText="Löscht…"
                            confirmText={`Verein „${v.name}“ mit allen Daten endgültig löschen? Das kann nicht rückgängig gemacht werden.`}
                          >
                            Löschen
                          </ConfirmSubmitButton>
                        </form>
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

                  {vorbereitung && (
                    <details className="rounded-lg border px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium">
                        Verein ansprechen (Instagram)
                        {kontakt?.angeschriebenAm && (
                          <span className="font-normal text-muted-foreground"> · angeschrieben am {formatDate(kontakt.angeschriebenAm)}</span>
                        )}
                      </summary>
                      <VereinAnsprechen
                        vereinId={v.id}
                        text={ansprache}
                        instagram={kontakt?.instagram ?? null}
                        profilUrl={kontakt?.instagram ? (normalisiereInstagram(kontakt.instagram)?.url ?? null) : null}
                        angeschriebenAm={kontakt?.angeschriebenAm ? formatDate(kontakt.angeschriebenAm) : null}
                        notiz={kontakt?.notiz ?? null}
                        hinweise={ansprachHinweise}
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
