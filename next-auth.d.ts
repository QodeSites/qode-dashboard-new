import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    icode?: string;
    accessType?: string;
    internalUserId?: string;
  }

  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      icode?: string;
      accessType?: string;
      internalUserId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    icode?: string;
    accessType?: string;
    internalUserId?: string;
  }
}
