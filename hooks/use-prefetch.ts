'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

// L2 · Instant feel.
//
// Nav items and list rows are buttons, not links, so Next never prefetches
// them. These handlers warm a route the moment a pointer rests on it or a
// finger touches down — usually a few hundred milliseconds before the tap
// lands, which is enough for the code and data to be ready on arrival.
//
// Spread onto any element: <button {...prefetch('/inspections')} onClick={...}>
export function usePrefetch() {
  const router = useRouter()

  return useCallback((route: string | null | undefined) => {
    if (!route) return {}
    const warm = () => { try { router.prefetch(route) } catch { /* prefetch is best effort */ } }
    return {
      onMouseEnter: warm,
      onFocus: warm,
      onTouchStart: warm,
      onPointerDown: warm,
    }
  }, [router])
}
