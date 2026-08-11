import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">FunktionsträgerHub Login</h1>
      <form
        action={async (formData) => {
          "use server";
          const email = formData.get("email");
          if (typeof email === "string" && email) {
            await signIn("nodemailer", { email, redirectTo: "/" });
          }
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="email" className="text-sm">
          E-Mail-Adresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="name@verein.de"
          className="rounded border px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-black px-3 py-2 text-white"
        >
          Login-Link senden
        </button>
      </form>
    </main>
  );
}
