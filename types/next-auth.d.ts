import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    icode?: string;
    accessType?: "admin" | "internal" | "distributor" | "client";
    internalUserId?: string;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      icode?: string;
      accessType?: "admin" | "internal" | "distributor" | "client";
      internalUserId?: string;
      impersonating?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    icode?: string;
    accessType?: "admin" | "internal" | "distributor" | "client";
    internalUserId?: string;
    impersonating?: string | null;
  }
}