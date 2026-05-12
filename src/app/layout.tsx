import type { Metadata } from 'next'
import { Roboto_Flex, DM_Sans } from 'next/font/google'
import './globals.css'
import AuthProvider from '@/components/providers/SessionProvider'

const robotoFlex = Roboto_Flex({
  subsets: ['latin'],
  variable: '--font-roboto-flex',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'WIN Sports Market',
  description: 'P2P Prediction Market for Sports Transfers',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${robotoFlex.variable} ${dmSans.variable}`}>
      <body className="min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}

