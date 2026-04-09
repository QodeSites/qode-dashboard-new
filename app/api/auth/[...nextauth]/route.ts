import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

export const authOptions = {
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

        // Check admin credentials from env
        const adminEmails = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
        const adminPasswords = (process.env.ADMIN_PASSWORDS || "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);

        const adminIndex = adminEmails.indexOf(credentials.identifier);
        if (adminIndex !== -1 && adminPasswords[adminIndex] === credentials.password) {
          return {
            id: "admin",
            name: adminEmails[adminIndex].split("@")[0],
            email: credentials.identifier,
            accessType: "admin" as const,
          };
        }

        // Distributor credentials (hardcoded for now)
        if (
          credentials.identifier === "dist@qodeinvest.com" &&
          credentials.password === "dist123"
        ) {
          return {
            id: "distributor",
            name: "Distributor",
            email: "dist@qodeinvest.com",
            accessType: "distributor" as const,
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

        return {
          id: user.id.toString(),
          icode: user.icode,
          name: user.user_name,
          email: user.email,
          accessType: "client" as const,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
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
      }
      // Support session updates for impersonation (admin only)
      if (trigger === "update" && session?.impersonating !== undefined) {
        if (token.accessType === "admin") {
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
        session.user.impersonating = token.impersonating || null;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
