import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { BLOCKED_ICODES } from "@/lib/blocked-icodes";

export const authOptions = {
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or ICode", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          return null;
        }

        const identifierLower = credentials.identifier.toLowerCase();
      const passwordLower = credentials.password.toLowerCase();

        // Check admin credentials from env
        const adminEmails = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        const adminPasswords = (process.env.ADMIN_PASSWORDS || "")
          .split(",")
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean);

        const adminIndex = adminEmails.indexOf(identifierLower);
        if (adminIndex !== -1 && adminPasswords[adminIndex] === passwordLower) {
          return {
            id: "admin",
            name: adminEmails[adminIndex].split("@")[0],
            email: adminEmails[adminIndex],
            accessType: "admin",
          };
        }

        // Distributor credentials (hardcoded for now)
        if (
          identifierLower === "live@qodeinvest.com" &&
          passwordLower === "live123"
        ) {
          return {
            id: "distributor",
            name: "Distributor",
            email: "dist@qodeinvest.com",
            accessType: "distributor",
          };
        }

        // Internal credentials
        const internalEmails = (process.env.INTERNAL_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        const internalPasswords = (process.env.INTERNAL_PASSWORDS || "")
          .split(",")
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean);

        const internalIndex = internalEmails.indexOf(identifierLower);
        if (
          internalIndex !== -1 &&
          internalPasswords[internalIndex] === passwordLower
        ) {
          return {
            id: "internal",
            name: internalEmails[internalIndex].split("@")[0],
            email: internalEmails[internalIndex],
            accessType: "internal",
          };
        }

        // Partner (distributor) credentials — DB-backed via `partners` table.
        // Checked before client auth so partner emails resolve to the partner role.
        const partner = await prisma.partners.findFirst({
          where: { email: identifierLower, active: true },
        });
        if (partner && partner.password === credentials.password) {
          return {
            id: partner.id.toString(),
            name: partner.name,
            email: partner.email,
            accessType: "partner",
            partnerId: partner.id.toString(),
          };
        }

        // Regular client auth
        const user = await prisma.clients.findFirst({
          where: {
            OR: [
              { email: credentials.identifier },
              { icode: credentials.identifier },
            ],
          },
        });

        if (!user || user.password !== credentials.password) {
          return null;
        }

        if (user.icode && BLOCKED_ICODES.has(user.icode)) {
          return null;
        }

        return {
          id: user.id.toString(),
          icode: user.icode,
          name: user.user_name,
          email: user.email,
          accessType: "client",
        };
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt" as const,
  },
  callbacks: {
    async jwt({ token, user, trigger, session }: any) {
      if (user) {
        token.icode = user.icode;
        token.name = user.name;
        token.email = user.email;
        token.accessType = user.accessType || "client";
        token.partnerId = user.partnerId;
      }
      // Support session updates for impersonation (admin + partner).
      // NOTE: for partners this only records the requested target in the token;
      // the token cannot hit the DB, so every data request must independently
      // re-verify the target icode is inside the partner's book server-side
      // (see getEffectiveIcodeChecked / partnerCanAccessIcode in admin-utils).
      if (trigger === "update" && session?.impersonating !== undefined) {
        if (token.accessType === "admin" || token.accessType === "partner") {
          token.impersonating = session.impersonating;
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.icode = token.icode;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.accessType = token.accessType || "client";
        session.user.partnerId = token.partnerId;
        session.user.impersonating = token.impersonating || null;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };