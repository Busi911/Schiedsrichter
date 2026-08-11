import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { sendMail } from "@/lib/mailer";
import { loginMailHtml, loginMailText } from "@/lib/login-mail";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
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
          "Dein Login-Link für Handballpate",
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
