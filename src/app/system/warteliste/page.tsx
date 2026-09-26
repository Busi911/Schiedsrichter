import { asc } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { requireSystemAdmin } from "@/lib/session";
import { wartelisteEintragEntfernen, wartelisteFreischalten } from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { formatDatumZeit } from "@/lib/format";

export default async function SystemWartelistePage() {
  await requireSystemAdmin();

  const eintraege = await adminDb.query.warteliste.findMany({
    orderBy: (w) => [asc(w.erstelltAm)],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Warteliste</h1>
        <p className="text-sm text-muted-foreground">
          Registrierungsanfragen, die eingetroffen sind, nachdem das
          Beta-Limit (einstellbar auf /system) bereits ausgeschöpft war.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Anfragen</CardTitle>
          <CardDescription>Älteste zuerst.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {eintraege.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aktuell niemand auf der Warteliste.
            </p>
          ) : (
            eintraege.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{e.vereinsname}</p>
                  <p className="text-muted-foreground">
                    {e.adminName} · {e.adminEmail}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Angefragt: {formatDatumZeit(e.erstelltAm)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={wartelisteFreischalten}>
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton variant="outline" size="sm">
                      Jetzt freischalten
                    </SubmitButton>
                  </form>
                  <form action={wartelisteEintragEntfernen}>
                    <input type="hidden" name="id" value={e.id} />
                    <ConfirmSubmitButton
                      confirmText={`Anfrage von ${e.vereinsname} wirklich entfernen, ohne den Verein anzulegen?`}
                      variant="ghost"
                      size="sm"
                    >
                      Entfernen
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
