import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      vereinId: string | null;
      istAdmin: boolean;
      istSystemAdmin: boolean;
      mussPasswortAendern: boolean;
    } & DefaultSession["user"];
  }

  // Rückgabetyp von authorize() im Credentials-Provider (siehe auth.ts) —
  // ohne das sieht der jwt-Callback dort nur die next-auth-Basisfelder.
  interface User {
    vereinId?: string | null;
    istAdmin?: boolean;
    istSystemAdmin?: boolean;
    mussPasswortAendern?: boolean;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    vereinId: string | null;
    istAdmin: boolean;
    istSystemAdmin: boolean;
    mussPasswortAendern: boolean;
  }
}

// JWT-Session (siehe session.strategy in auth.ts) — die Felder werden im
// jwt-Callback aus dem User übernommen und im session-Callback wieder auf
// die Session gespiegelt. Muss auf @auth/core/jwt zielen, nicht auf
// next-auth/jwt (das re-exportiert nur per "export *" — Interface-Merging
// greift dort nicht).
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    vereinId?: string | null;
    istAdmin?: boolean;
    istSystemAdmin?: boolean;
    mussPasswortAendern?: boolean;
  }
}
