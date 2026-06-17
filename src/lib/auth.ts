import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types/enums";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Employees are pre-provisioned as `User` rows by the RM Tool /
      // Weekly Upload import (with an email but no linked `Account`)
      // before they ever sign in. Without this flag, Auth.js's
      // PrismaAdapter refuses to link their first Google sign-in to that
      // pre-existing User row and redirects to
      // /login?error=OAuthAccountNotLinked. Google verifies email
      // ownership, so linking by email here is safe.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as unknown as { role: Role }).role;
        session.user.jobTitle = (user as unknown as { jobTitle: string | null }).jobTitle;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      await prisma.auditLog.create({
        data: {
          actorId: user.id ?? null,
          action: "logged_in",
          targetType: "User",
          targetId: user.id ?? null,
          details: user.email ?? undefined,
        },
      });
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
