import "next-auth";
import "next-auth/jwt";

type AccessType = "admin" | "internal" | "distributor" | "partner" | "client";

interface Impersonation {
  icode: string;
  name: string;
  email: string;
}

declare module "next-auth" {
  interface User {
    icode?: string;
    accessType?: AccessType;
    internalUserId?: string;
    partnerId?: string;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      icode?: string;
      accessType?: AccessType;
      internalUserId?: string;
      partnerId?: string;
      impersonating?: Impersonation | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    icode?: string;
    accessType?: AccessType;
    internalUserId?: string;
    partnerId?: string;
    impersonating?: Impersonation | null;
  }
}