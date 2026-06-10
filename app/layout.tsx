import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from '@/components/providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Condition IQ — Vehicle Inspection Platform',
  description: 'Professional vehicle condition reports',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-inter">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
