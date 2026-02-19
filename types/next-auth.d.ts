import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    icode?: string;
    accessType?: "admin" | "client";
  }
  interface Session {
    user: {
      icode?: string;
      name?: string | null;
      email?: string | null;
      accessType?: "admin" | "client";
      impersonating?: {
        icode: string;
        name: string;
        email: string;
      } | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    icode?: string;
    accessType?: "admin" | "client";
    impersonating?: {
      icode: string;
      name: string;
      email: string;
    } | null;
  }
}
