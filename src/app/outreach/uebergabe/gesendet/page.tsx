import Link from "next/link";

// Bestätigungsseite nach der Outreach-Übergabe: "Login-Link wurde versendet."
export default async function OutreachUebergabeGesendetPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">Login-Link versendet</h1>
        <p className="text-muted-foreground mb-2">
          Wir haben einen Login-Link an{" "}
          {email ? (
            <span className="font-semibold text-foreground">{email}</span>
          ) : (
            "deine E-Mail-Adresse"
          )}{" "}
          gesendet. Klicke auf den Link in der E-Mail, um dich einzuloggen und
          deinen Verein zu verwalten.
        </p>
        <p className="text-sm text-muted-foreground mt-6">
          <Link href="/login" className="underline">
            Zum Login
          </Link>
        </p>
      </div>
    </div>
  );
}
