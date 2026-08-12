import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { mitColdStartRetry } from "@/db/retry";
import { sendMail } from "@/lib/mailer";
import { loginMailHtml, loginMailText } from "@/lib/login-mail";

// Login und jede Session-Prüfung (session: "database", siehe unten) gehen
// bei jedem Request direkt über diesen Adapter zur DB — bei einem
// Cold-Start-Verbindungsfehler (siehe mitColdStartRetry) soll das
// automatisch erneut versucht werden statt dem Nutzer einen Fehler zu
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
  // Datenbank-Sessions sind für den Nodemailer/Magic-Link-Provider erforderlich
  // (JWT-Sessions unterstützen keine Einmal-Token-Validierung über die DB).
  session: { strategy: "database" },
  providers: [
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
    verifyRequest: "/login/verify",
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.vereinId = user.vereinId;
      session.user.istAdmin = user.istAdmin;
      session.user.istSystemAdmin = user.istSystemAdmin;
      return session;
    },
  },
});
