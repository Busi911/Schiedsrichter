import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDatumZeitLang } from "@/lib/format";
import { ARTEN, antwortNochMoeglich, type Art } from "@/lib/vereinstermine";
import { kuerzeSerien } from "@/lib/wiederholung";
import { holeSichtbareVereinstermine, holeVereinsterminPerson, ladeAntworten } from "@/lib/vereinstermine-daten";

const MAX = 3;

// Hinweiskarte auf /profil: Vereinstermine (Sitzungen u.ä.), zu denen die Person noch keine Zu- oder Absage gegeben hat. Verschwindet, sobald alles beantwortet ist.
export async function VereinsterminOffenKarte({ vereinId, userId, istAdmin }: { vereinId: string; userId: string; istAdmin: boolean }) {
  const jetzt = new Date();
  const person = await holeVereinsterminPerson(vereinId, userId, istAdmin);
  const termine = (await holeSichtbareVereinstermine(vereinId, person, jetzt)).filter((t) => t.antwortAbfrage && antwortNochMoeglich(t.start, jetzt));
  if (termine.length === 0) return null;
  const antworten = await ladeAntworten(vereinId, termine.map((t) => t.id));
  const offen = kuerzeSerien(
    termine.filter((t) => !(antworten.get(t.id) ?? []).some((a) => a.userId === userId)),
    3
  ).sichtbar;
  if (offen.length === 0) return null;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">
          {offen.length === 1 ? "Eine Rückmeldung steht aus" : `${offen.length} Rückmeldungen stehen aus`}
        </CardTitle>
        <CardDescription>Der Verein möchte wissen, ob du kommen kannst.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <ul className="flex flex-col gap-1">
          {offen.slice(0, MAX).map((t) => (
            <li key={t.id}>
              <Link href={`/profil/vereinstermine#termin-${t.id}`} className="font-medium underline">
                {ARTEN[t.art as Art] ?? "Termin"}: {t.titel}
              </Link>{" "}
              <span className="text-muted-foreground">· {formatDatumZeitLang(t.start)}</span>
            </li>
          ))}
        </ul>
        <Link href="/profil/vereinstermine" className="inline-flex min-h-11 items-center font-medium underline">
          Zu den Vereinsterminen{offen.length > MAX ? ` (${offen.length - MAX} weitere)` : ""}
        </Link>
      </CardContent>
    </Card>
  );
}
