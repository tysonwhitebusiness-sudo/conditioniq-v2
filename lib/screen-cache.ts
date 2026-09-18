'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// L2 · Instant feel.
//
// A screen that has been opened once keeps what it showed. Coming back to it
// paints that immediately and refreshes quietly underneath, instead of dropping
// to a spinner and fetching the same rows again.
//
// The cache lives for the browsing session only — a reload starts clean, so
// nothing stale can outlive a deploy or a sign-out.

type Entry = { data: unknown; at: number }

const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

export function clearScreenCache(prefix?: string) {
  if (!prefix) { cache.clear(); return }
  cache.forEach((_, key) => { if (key.startsWith(prefix)) cache.delete(key) })
}

export function peekScreenCache<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined
}

// Runs the loader now and keeps the result, so a screen can be warmed before
// anyone opens it (see prefetchScreen in use-prefetch.ts).
export function primeScreenCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const promise = loader()
    .then(data => { cache.set(key, { data, at: Date.now() }); return data })
    .finally(() => { inflight.delete(key) })
  inflight.set(key, promise)
  return promise
}

export interface CachedResult<T> {
  data: T | undefined
  // True only when there is nothing to show yet. A background refresh of data
  // already on screen never flips this back on, so the screen doesn't blink.
  loading: boolean
  refreshing: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * Cached screen data.
 *
 * @param key    what this data is — include every input it depends on
 * @param loader how to fetch it
 * @param maxAge how old cached data may be before it is refreshed in the
 *               background on the next visit (default 30s)
 */
export function useCachedScreenData<T>(
  key: string | null,
  loader: () => Promise<T>,
  maxAge = 30_000,
): CachedResult<T> {
  const cached = key ? peekScreenCache<T>(key) : undefined
  const [data, setData] = useState<T | undefined>(cached)
  const [loading, setLoading] = useState(cached === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const run = useCallback(async (background: boolean) => {
    if (!key) return
    background ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const fresh = await primeScreenCache(key, () => loaderRef.current())
      if (mounted.current) setData(fresh)
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? 'Could not load')
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false) }
    }
  }, [key])

  useEffect(() => {
    if (!key) return
    const entry = cache.get(key)
    if (entry === undefined) { run(false); return }
    setData(entry.data as T)
    setLoading(false)
    if (Date.now() - entry.at > maxAge) run(true)
  }, [key, maxAge, run])

  const reload = useCallback(async () => {
    if (key) cache.delete(key)
    await run(data !== undefined)
  }, [key, run, data])

  return { data, loading, refreshing, error, reload }
}
