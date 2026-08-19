import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { mitColdStartRetry } from "@/db/retry";
import { pruefePasswort } from "@/lib/passwort";
import { sendMail } from "@/lib/mailer";
import { loginMailHtml, loginMailText } from "@/lib/login-mail";

// Login und jede Session-Prüfung gehen bei jedem Request direkt über diesen
// Adapter zur DB (Verifikations-Token für Magic-Link, User/Account-Lookup)
// — bei einem Cold-Start-Verbindungsfehler (siehe mitColdStartRetry) soll
// das automatisch erneut versucht werden statt dem Nutzer einen Fehler zu
// zeigen. Jede Adapter-Methode einzeln wrappen, statt tiefer in die
// DB-Verbindung selbst einzugreifen (siehe withTenant in db/index.ts).
function mitRetryAdapter(adapter: Adapter): Adapter {
  const gewrapped: Record<string, unknown> = {};
  for (const [name, wert] of Object.entries(adapter)) {
    gewrapped[name] =
      typeof wert === "function"
        ? (...args: unknown[]) =>
            mitColdStartRetry(() =>
              (wert as (...a: unknown[]) => Promise<unknown>)(...args)
            )
        : wert;
  }
  return gewrapped as Adapter;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: mitRetryAdapter(
    DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    })
  ),
  // JWT statt Datenbank-Sessions: der Credentials-Provider (Passwort-Login,
  // siehe unten) vergibt bei Auth.js technisch IMMER eine JWT-Cookie-Session,
  // unabhängig von dieser Einstellung — mit "database" käme es zu
  // Inkonsistenzen (Rolle/Admin-Rechte würden bei Passwort-Login nicht in
  // die Session übernommen). Der Nodemailer/Magic-Link-Provider funktioniert
  // unverändert, da Einmal-Token weiterhin über den Adapter validiert
  // werden — nur die resultierende Session ist jetzt ein JWT statt einer
  // DB-Zeile. Nebeneffekt: Rollenänderungen (z.B. Admin-Rechte entziehen)
  // wirken erst beim nächsten Login der betroffenen Person, nicht sofort
  // (bewusst in Kauf genommen, siehe Commit-Historie).
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const passwort = credentials?.password;
        if (typeof email !== "string" || typeof passwort !== "string") {
          return null;
        }

        const nutzer = await mitColdStartRetry(() =>
          db.query.users.findFirst({ where: eq(users.email, email) })
        );
        if (!nutzer?.passwordHash) return null;

        const stimmt = await pruefePasswort(passwort, nutzer.passwordHash);
        if (!stimmt) return null;

        return nutzer;
      },
    }),
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      },
      from: process.env.SMTP_FROM,
      // Eigenes Template statt der generischen Auth.js-Standardmail — nutzt
      // denselben Transporter wie der Rest der App (src/lib/mailer.ts).
      async sendVerificationRequest({ identifier: email, url }) {
        await sendMail(
          email,
          "Dein Login-Link für HandballerPate",
          loginMailText(url),
          loginMailHtml(url)
        );
      },
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  callbacks: {
    // Nur bei frischem Login gesetzt (user vorhanden, kommt vom Adapter
    // bzw. von authorize() oben) — bei Folge-Requests wird der bereits im
    // Token gespeicherte Stand übernommen, damit nicht bei jedem Request
    // die DB gelesen werden muss (siehe Nebeneffekt-Kommentar oben).
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.vereinId = user.vereinId;
        token.istAdmin = user.istAdmin;
        token.istAdminLesend = user.istAdminLesend;
        token.istSystemAdmin = user.istSystemAdmin;
        token.mussPasswortAendern = user.mussPasswortAendern;

        // Best-effort — ein Fehler hier (z.B. kurzer DB-Hänger) darf den
        // Login selbst nicht verhindern, daher nicht awaited/geworfen,
        // sondern nur protokolliert. Für /admin/funktionstraeger, siehe
        // Kommentar bei users.letzterLoginAm in db/schema.ts.
        const userId = user.id;
        if (userId) {
          mitColdStartRetry(() =>
            db
              .update(users)
              .set({ letzterLoginAm: new Date() })
              .where(eq(users.id, userId))
          ).catch((err) => {
            console.error("letzterLoginAm konnte nicht aktualisiert werden:", err);
          });
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id ?? "";
      session.user.vereinId = token.vereinId ?? null;
      session.user.istAdmin = token.istAdmin ?? false;
      session.user.istAdminLesend = token.istAdminLesend ?? false;
      session.user.istSystemAdmin = token.istSystemAdmin ?? false;
      session.user.mussPasswortAendern = token.mussPasswortAendern ?? false;
      return session;
    },
  },
});
