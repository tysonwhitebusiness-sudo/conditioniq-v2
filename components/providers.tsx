'use client'

import { AuthProvider, type AuthInitialData } from '@/contexts/auth-context'
import { OfflineProvider } from '@/contexts/offline-context'
import GhostBanner from '@/components/ui/ghost-banner'

export default function Providers({ children, initialAuth }: { children: React.ReactNode; initialAuth?: AuthInitialData }) {
  return (
    <AuthProvider initial={initialAuth}>
      <OfflineProvider>
        <GhostBanner />
        {children}
      </OfflineProvider>
    </AuthProvider>
  )
}
