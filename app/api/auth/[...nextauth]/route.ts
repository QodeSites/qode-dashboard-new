import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import jwt from 'jsonwebtoken';

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
        };
      },
    }),
    // Add Internal Access Provider
    CredentialsProvider({
      id: "internal-access",
      name: "Internal Access",
      credentials: {
        token: { label: "Access Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) {
          return null;
        }

        try {
          console.log('Authorizing internal access token');
          
          // Verify the JWT token from internal system
          const decoded = jwt.verify(credentials.token, process.env.JWT_SECRET!) as any;
          console.log('Decoded token:', decoded);
          
          // For session tokens (from internal-signin page), handle differently
          if (decoded.id && decoded.icode && decoded.accessType === 'internal_viewer') {
            // This is a session token, return the user data directly
            return {
              id: decoded.id,
              icode: decoded.icode,
              name: decoded.name,
              email: decoded.email,
              accessType: decoded.accessType,
            };
          }
          
          // For initial access tokens, validate structure
          if (!decoded.client_id || decoded.role !== 'internal_viewer') {
            console.log('Invalid token structure');
            return null;
          }

          // Check if token is expired
          if (decoded.exp < Math.floor(Date.now() / 1000)) {
            console.log('Token expired');
            return null;
          }

          // Fetch the client data using icode
          const client = await prisma.clients.findFirst({
            where: { icode: decoded.client_id },
          });

          console.log('Found client:', client ? client.icode : 'No client found');

          if (!client) {
            return null;
          }

          return {
            id: client.id.toString(),
            icode: client.icode,
            name: client.user_name,
            email: client.email,
            accessType: 'internal_viewer',
          };
        } catch (error) {
          console.error('Internal access token validation failed:', error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.icode = user.icode;
        token.name = user.name;
        token.email = user.email;
        token.accessType = user.accessType || 'client';
        token.internalUserId = user.internalUserId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.icode = token.icode;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.accessType = token.accessType || 'client';
        session.user.internalUserId = token.internalUserId;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };