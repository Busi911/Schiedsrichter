import Link from "next/link";

export const metadata = { title: "Impressum – HandballerPate" };

// Platzhalter-Werte — noch mit den echten Angaben des Betreibers zu
// ersetzen (siehe Vorlage https://www.deweconsulting.de/impressum).
const ANGABEN = {
  firma: "[Platzhalter: Firma/Verein]",
  vertreter: "[Platzhalter: Vertretungsberechtigte Person]",
  strasse: "[Platzhalter: Straße Hausnummer]",
  plzOrt: "[Platzhalter: PLZ Ort]",
  telefon: "[Platzhalter: Telefonnummer]",
  email: "[Platzhalter: E-Mail-Adresse]",
  register: "[Platzhalter: Handelsregister/Vereinsregister, Registergericht]",
  ustId: "[Platzhalter: USt-IdNr., falls vorhanden]",
};

export default function ImpressumPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/login" className="text-sm text-muted-foreground underline">
          ← Zurück zum Login
        </Link>
      </div>

      <h1 className="font-heading text-2xl font-semibold">Impressum</h1>

      <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-400">
        Platzhalter — noch mit den echten Angaben zu füllen (Angaben nach
        § 5 DDG).
      </p>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Angaben gemäß § 5 DDG</p>
        <p>{ANGABEN.firma}</p>
        <p>{ANGABEN.vertreter}</p>
        <p>{ANGABEN.strasse}</p>
        <p>{ANGABEN.plzOrt}</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Kontakt</p>
        <p>Telefon: {ANGABEN.telefon}</p>
        <p>E-Mail: {ANGABEN.email}</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Registereintrag</p>
        <p>{ANGABEN.register}</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Umsatzsteuer-ID</p>
        <p>{ANGABEN.ustId}</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </p>
        <p>{ANGABEN.vertreter}</p>
      </section>
    </main>
  );
}
