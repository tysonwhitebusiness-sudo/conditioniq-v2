export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from '@/components/providers'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getAuthBootstrap } from '@/lib/auth-bootstrap'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Condition IQ — Vehicle Inspection Platform',
  description: 'Professional vehicle condition reports',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved here, while the page renders, so screens don't open with three
  // round trips before they can load anything of their own.
  const initialAuth = await getAuthBootstrap()

  return (
    <html lang="en" className={inter.variable}>
      <body className="font-inter">
        <Providers initialAuth={initialAuth}>
          {children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
