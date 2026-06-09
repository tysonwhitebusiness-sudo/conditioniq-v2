'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { syncOfflineInspections, type SyncStatus } from '@/lib/offline-sync'

interface OfflineContextValue {
  isOnline: boolean
  syncStatus: SyncStatus
  isSyncing: boolean
  triggerSync: () => void
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  syncStatus: { pending: 0, inProgress: false, failed: 0, total: 0, lastSyncAt: null },
  isSyncing: false,
  triggerSync: () => {},
})

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pending: 0, inProgress: false, failed: 0, total: 0, lastSyncAt: null,
  })
  const [isSyncing, setIsSyncing] = useState(false)

  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) return
    setIsSyncing(true)
    setSyncStatus(s => ({ ...s, inProgress: true }))
    try {
      const result = await syncOfflineInspections(setSyncStatus)
      setSyncStatus(result)
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, isOnline])

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      triggerSync()
    }
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [triggerSync])

  return (
    <OfflineContext.Provider value={{ isOnline, syncStatus, isSyncing, triggerSync }}>
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline() {
  return useContext(OfflineContext)
}
