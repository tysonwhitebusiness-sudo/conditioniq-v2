'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { useOffline } from '@/contexts/offline-context'

export default function OfflineIndicator() {
  const { isOnline, syncStatus, isSyncing, triggerSync } = useOffline()

  if (isOnline && syncStatus.pending === 0) return null

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${!isOnline ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
      <WifiOff size={12} />
      {!isOnline ? (
        <span>Offline — saving locally</span>
      ) : (
        <span>{syncStatus.pending} pending sync</span>
      )}
      {isOnline && syncStatus.pending > 0 && (
        <button onClick={triggerSync} disabled={isSyncing} className="hover:opacity-70">
          <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  )
}
