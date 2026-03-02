import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  trustHost: true,
  callbacks: {
    async session({ session, user }) {
      try {
        if (session.user) {
          session.user.id = user.id
          // Hardcoded Master Admin for safety
          const masterAdmins = ["esteban@win.investments"]
          if (masterAdmins.includes(user.email)) {
            session.user.role = "ADMIN"
          } else {
            session.user.role = (user as any).role || "USER"
          }
        }
        return session
      } catch (error) {
        console.error("Error in session callback:", error)
        return session
      }
    },
    async signIn({ user, account, profile }) {
      try {
        console.log("Sign in attempts for:", user.email)
        return true
      } catch (error) {
        console.error("Error in signIn callback:", error)
        return false
      }
    }
  },
  pages: {
    signIn: "/login",
  },
  debug: process.env.NODE_ENV === "development",
})
