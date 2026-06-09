'use client'

import { AuthProvider } from '@/contexts/auth-context'
import { OfflineProvider } from '@/contexts/offline-context'
import GhostBanner from '@/components/ui/ghost-banner'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OfflineProvider>
        <GhostBanner />
        {children}
      </OfflineProvider>
    </AuthProvider>
  )
}
