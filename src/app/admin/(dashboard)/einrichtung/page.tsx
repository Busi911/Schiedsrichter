import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine, vereine } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { findeIndexKandidaten } from "@/lib/nuliga/vereinsindex";
import { EinrichtungsChecklisteListe, leseEinrichtungsErgebnis } from "@/components/einrichtungs-checkliste";
import { HilfeHinweis } from "@/components/hilfe-hinweis";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { einrichtungUeberspringen, selbstEinrichten } from "./actions";

// Laden von Verein, Mannschaften und Spielen dauert bis zu einer Minute.
export const maxDuration = 60;

export default async function EinrichtungPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; einrichtung?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { fehler, einrichtung } = await searchParams;
  const ergebnis = leseEinrichtungsErgebnis(einrichtung);

  const [verein] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  const ligaVerein = await adminDb.query.ligaVereine.findFirst({ where: eq(ligaVereine.vereinId, vereinId) });
  const angebunden = !!(ligaVerein?.nuligaClubId || ligaVerein?.handballNetClubId || ligaVerein?.handballNetTeamIds);

  // Schon eingerichtet und kein frisches Ergebnis: nichts mehr zu tun, die Einstellungen sind der Ort für Änderungen.
  if (angebunden && !ergebnis) redirect("/admin/einstellungen#oeffentliche-seite");

  if (ergebnis) {
    const fehlerAnzahl = ergebnis.schritte.filter((x) => x.status === "fehler").length;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <h1 className="font-heading text-2xl font-semibold">Einrichtung abgeschlossen</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ergebnis.verein}</CardTitle>
            <CardDescription>
              ✓ hat automatisch geklappt · ! bitte kurz prüfen · ✕ hat nicht geklappt.
              {fehlerAnzahl > 0 && " Fehlgeschlagenes könnt ihr unter Einstellungen → Öffentliche Vereinsseite erneut anstoßen."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EinrichtungsChecklisteListe schritte={ergebnis.schritte} />
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href="/admin" />} nativeButton={false}>
                Weiter zur Übersicht
              </Button>
              <Button render={<Link href="/admin/mannschaften" />} nativeButton={false} variant="outline">
                Mannschaften ansehen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const vergeben = new Set(
    (await adminDb.select({ id: ligaVereine.nuligaClubId }).from(ligaVereine)).map((z) => z.id).filter((x): x is string => !!x)
  );
  const vorschlaege = await findeIndexKandidaten(adminDb, verein?.name ?? "", vergeben);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Willkommen — richten wir {verein?.name ?? "euren Verein"} ein</h1>
        <p className="text-sm text-muted-foreground">
          Wir holen Mannschaften, Spielplan, Hallen und Logo automatisch aus eurer Liga-Seite und legen die Heimspiele als Termine an. Dafür brauchen
          wir nur, wo eure Mannschaften gelistet sind. Es wird keine Mail verschickt.{" "}
          <HilfeHinweis anker="einrichtung-assistent" />
        </p>
      </div>

      {fehler && <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{fehler}</p>}

      <Card>
        <CardContent className="pt-4">
          <form action={selbstEinrichten} className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Wo sind eure Mannschaften gelistet?</legend>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
                <input type="radio" name="quelle" value="nuliga" className="size-4" />
                <span>
                  <span className="font-medium">nuLiga</span> <span className="text-muted-foreground">(Landesverbände, z.B. HHV)</span>
                </span>
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
                <input type="radio" name="quelle" value="handball_net" className="size-4" />
                <span>
                  <span className="font-medium">handball.net</span> <span className="text-muted-foreground">(3. Liga, Jugendbundesliga, DHB)</span>
                </span>
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
                <input type="radio" name="quelle" value="beide" defaultChecked className="size-4" />
                <span>
                  <span className="font-medium">Beides / weiß ich nicht genau</span>{" "}
                  <span className="text-muted-foreground">(dann bitte beide IDs eintragen, soweit bekannt)</span>
                </span>
              </label>
            </fieldset>

            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">nuLiga</p>
              {vorschlaege.length > 0 && (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1 text-xs text-muted-foreground">Ist das euer Verein? (Treffer aus dem nuLiga-Vereinsverzeichnis)</legend>
                  {vorschlaege.map((t) => (
                    <label key={t.id} className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
                      <input type="radio" name="nuligaVorschlag" value={t.clubId} className="size-4" />
                      <span>
                        <span className="font-medium">{t.name}</span>{" "}
                        <span className="text-muted-foreground">{[t.bezirk, t.nummer && `VNr. ${t.nummer}`].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuligaClubId">{vorschlaege.length > 0 ? "Oder die nuLiga-Vereins-ID selbst eintragen" : "nuLiga-Vereins-ID"}</Label>
                <Input id="nuligaClubId" name="nuligaClubId" inputMode="numeric" placeholder="z.B. 69723" className="w-full sm:w-56" />
                <p className="text-xs text-muted-foreground">
                  Steht in der Adresse eurer Vereinsseite bei nuLiga: …<code>club=</code>
                  <b>69723</b>. Die Vereinsnummer (VNr.) ist nicht die ID.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <Label htmlFor="handballNetClubId">handball.net-Vereins-ID</Label>
              <Input id="handballNetClubId" name="handballNetClubId" placeholder="z.B. 0b8y490" className="w-full sm:w-56" />
              <p className="text-xs text-muted-foreground">
                Steht in der Adresse eurer Vereinsseite auf handball.net: …/clubs/<b>0b8y490</b>/…
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="Richte ein… (bis 1 Min.)">Jetzt automatisch einrichten</SubmitButton>
            </div>
          </form>
          <form action={einrichtungUeberspringen} className="mt-2">
            <SubmitButton variant="ghost" size="sm" className="px-0 text-muted-foreground underline">
              Später, ich richte alles selbst ein
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
