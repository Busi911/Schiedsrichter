import Link from "next/link";

export const metadata = { title: "Impressum – HandballerPate" };

export default function ImpressumPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/login" className="text-sm text-muted-foreground underline">
          ← Zurück zum Login
        </Link>
      </div>

      <h1 className="font-heading text-2xl font-semibold">Impressum</h1>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Angaben gemäß § 5 TMG</p>
        <p>DeWe Consulting UG (haftungsbeschränkt)</p>
        <p>Garbenheimer Str. 24</p>
        <p>35582 Wetzlar</p>
        <p>Deutschland</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Kontakt</p>
        <p>E-Mail: info@deweconsulting.de</p>
        <p>Telefon: +49 15679 774 272</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Handelsregistereintrag</p>
        <p>Registergericht: Amtsgericht Wetzlar</p>
        <p>Handelsregisternummer: HRB 9614</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Steuernummer</p>
        <p>020 231 24985</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
        </p>
        <p>Dennis Weber</p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Streitschlichtung</p>
        <p>
          Die Europäische Kommission stellt eine Plattform zur
          Online-Streitbeilegung (OS) bereit:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            className="underline"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
        </p>
        <p>
          Wir sind nicht bereit oder verpflichtet, an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen.
        </p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Haftung für Inhalte</p>
        <p>
          Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene
          Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
          verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter
          jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
          Informationen zu überwachen oder nach Umständen zu forschen, die
          auf eine rechtswidrige Tätigkeit hinweisen.
        </p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Haftung für Links</p>
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf
          deren Inhalte wir keinen Einfluss haben. Deshalb können wir für
          diese fremden Inhalte auch keine Gewähr übernehmen. Für die
          Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
          oder Betreiber der Seiten verantwortlich.
        </p>
      </section>

      <section className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Urheberrecht</p>
        <p>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke auf
          diesen Seiten unterliegen dem deutschen Urheberrecht. Die
          Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
          Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der
          schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
        </p>
      </section>
    </main>
  );
}
