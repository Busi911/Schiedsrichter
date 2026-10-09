import { pruefeOutreachUebergabeToken } from "@/lib/outreach-uebergabe";
import { uebergebeVereinSelbstbedienung } from "./actions";

// Öffentliche Landing-Page für die Outreach-Übergabe: Der Empfänger der
// Outreach-Mail klickt auf "Verein übernehmen", landet hier, gibt Name +
// E-Mail ein, und bekommt einen Magic-Link zum Einloggen als Vereinsadmin.
export default async function OutreachUebergabePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const vereinId = pruefeOutreachUebergabeToken(token);
  if (!vereinId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Link ungültig</h1>
          <p className="text-muted-foreground">
            Dieser Link ist nicht gültig oder abgelaufen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-2">Verein übernehmen</h1>
        <p className="text-muted-foreground text-center mb-8 text-sm">
          Du wurdest eingeladen, die Verwaltung deines Vereins bei HandballerPate
          zu übernehmen. Gib deinen Namen und deine E-Mail-Adresse ein — du
          bekommst einen Login-Link per E-Mail.
        </p>
        <UebergabeForm token={token} />
      </div>
    </div>
  );
}

function UebergabeForm({ token }: { token: string }) {
  return (
    <form action={uebergebeVereinSelbstbedienung} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          autoComplete="name"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="Dein Name"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          E-Mail-Adresse
        </label>
        <input
          type="email"
          id="email"
          name="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="deine@email.de"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-2.5 text-sm hover:bg-primary/90 transition-colors"
      >
        Verein übernehmen
      </button>
      <p className="text-xs text-muted-foreground text-center">
        Mit dem Übernehmen stimmst du den Bedingungen zu und wirst Vereinsadmin.
        Du kannst jederzeit abmelden. Der Login-Link wird an die angegebene
        E-Mail gesendet.
      </p>
    </form>
  );
}
