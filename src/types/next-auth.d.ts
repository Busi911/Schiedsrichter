import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      vereinId: string | null;
      istAdmin: boolean;
      istSystemAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    vereinId: string | null;
    istAdmin: boolean;
    istSystemAdmin: boolean;
  }
}
