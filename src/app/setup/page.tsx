import { bootstrapVerein } from "./actions";

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Verein einrichten</h1>
      <p className="text-sm text-gray-600">
        Einmaliger Bootstrap: legt den ersten Verein und dessen Admin-Account
        an. Erfordert das Setup-Secret aus der Server-Umgebung.
      </p>
      <form action={bootstrapVerein} className="flex flex-col gap-3">
        <label htmlFor="secret" className="text-sm">
          Setup-Secret
        </label>
        <input
          id="secret"
          name="secret"
          type="password"
          required
          className="rounded border px-3 py-2"
        />

        <label htmlFor="vereinsname" className="text-sm">
          Vereinsname
        </label>
        <input
          id="vereinsname"
          name="vereinsname"
          type="text"
          required
          className="rounded border px-3 py-2"
        />

        <label htmlFor="adminName" className="text-sm">
          Name des Admins
        </label>
        <input
          id="adminName"
          name="adminName"
          type="text"
          required
          className="rounded border px-3 py-2"
        />

        <label htmlFor="adminEmail" className="text-sm">
          E-Mail des Admins
        </label>
        <input
          id="adminEmail"
          name="adminEmail"
          type="email"
          required
          className="rounded border px-3 py-2"
        />

        <button
          type="submit"
          className="rounded bg-black px-3 py-2 text-white"
        >
          Verein anlegen
        </button>
      </form>
    </main>
  );
}
