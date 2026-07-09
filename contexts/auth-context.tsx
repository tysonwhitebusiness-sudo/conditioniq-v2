'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { PlatformRole, CompanyRole } from '@/lib/roles'
import { getUserCompanyRole } from '@/lib/auth-server-actions'
import type { RawCompanyRole } from '@/lib/roles'
import { logAdminActivity } from '@/lib/admin-activity-actions'

const GHOST_MODE_STORAGE_KEY = 'ciq_ghost_session'
const GHOST_MODE_TIMEOUT_MS = 4 * 60 * 60 * 1000 // 4 hours — impersonation session safety timeout

interface GhostSession {
  company: Company
  startedAt: number
}

interface UserProfile {
  id: string
  full_name: string | null
  email: string | null
  role: string
  platform_role: PlatformRole
  company_id: string | null
  employee_id: string | null
  location_assignments: string[] | null
  default_location: string | null
}

export interface Company {
  id: string
  name: string
  slug: string | null
  subscription_tier: string
  reports_used: number
  reports_included: number
  billing_cycle_start: string
  stripe_customer_id: string | null
  account_type: string
  legacy_pricing: boolean
  billing_interval: string
}

interface AuthContextValue {
  user: User | null
  userProfile: UserProfile | null
  company: Company | null
  impersonatedCompany: Company | null
  impersonatedAt: number | null
  enterGhostMode: (c: Company) => void
  exitGhostMode: () => void
  effectiveCompany: Company | null
  platformRole: PlatformRole
  companyRole: CompanyRole | null  // 'admin' | 'inspector' — 'owner' is normalized to 'admin'
  isCompanyOwner: boolean          // true when company_members.role === 'owner'
  isOwnerUser: boolean             // kept for backward compat — true when platformRole === 'super_admin'
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  userProfile: null,
  company: null,
  impersonatedCompany: null,
  impersonatedAt: null,
  enterGhostMode: () => {},
  exitGhostMode: () => {},
  effectiveCompany: null,
  platformRole: 'user',
  companyRole: null,
  isCompanyOwner: false,
  isOwnerUser: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [companyRole, setCompanyRole] = useState<CompanyRole | null>(null)
  const [isCompanyOwner, setIsCompanyOwner] = useState(false)
  const [impersonatedCompany, setImpersonatedCompany] = useState<Company | null>(null)
  const [impersonatedAt, setImpersonatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const clearGhostStorage = useCallback(() => {
    try { localStorage.removeItem(GHOST_MODE_STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  // Restore an in-progress ghost session across reloads / tab close-reopen —
  // but only within the safety timeout window; a stale session past that is
  // silently cleared rather than resumed.
  useEffect(() => {
    let raw: string | null = null
    try { raw = localStorage.getItem(GHOST_MODE_STORAGE_KEY) } catch { /* ignore */ }
    if (!raw) return
    try {
      const session: GhostSession = JSON.parse(raw)
      const expired = Date.now() - session.startedAt > GHOST_MODE_TIMEOUT_MS
      if (expired) {
        clearGhostStorage()
        logAdminActivity({
          accountId: session.company.id,
          actionType: 'ghost_mode_exited',
          description: `Ghost session for ${session.company.name} expired after timeout`,
          metadata: { reason: 'timeout', durationMs: Date.now() - session.startedAt },
        })
      } else {
        setImpersonatedCompany(session.company)
        setImpersonatedAt(session.startedAt)
      }
    } catch {
      clearGhostStorage()
    }
    // Runs once on mount only — restoring a persisted session, not reacting to state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProfile = useCallback(async (u: User) => {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', u.id)
      .single()

    setUserProfile(profile ?? null)

    if (profile?.company_id) {
      const [compRes, rawRole] = await Promise.all([
        supabase.from('companies').select('*').eq('id', profile.company_id).single(),
        getUserCompanyRole(u.id, profile.company_id),
      ])
      setCompany(compRes.data ?? null)
      // Normalize 'owner' → 'admin' so all existing feature gates work without changes.
      // Use isCompanyOwner to distinguish the account owner in UI.
      const normalizedRole: CompanyRole | null = rawRole === 'owner' ? 'admin' : (rawRole as CompanyRole | null)
      setCompanyRole(normalizedRole)
      setIsCompanyOwner(rawRole === 'owner')
    } else {
      setCompany(null)
      setCompanyRole(null)
      setIsCompanyOwner(false)
    }
  }, [supabase])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user)
      } else {
        setUserProfile(null)
        setCompany(null)
        setCompanyRole(null)
        setIsCompanyOwner(false)
        setImpersonatedCompany(null)
        setImpersonatedAt(null)
        clearGhostStorage()
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, loadProfile, clearGhostStorage])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user)
  }, [user, loadProfile])

  const enterGhostMode = useCallback((targetCompany: Company) => {
    const startedAt = Date.now()
    setImpersonatedCompany(targetCompany)
    setImpersonatedAt(startedAt)
    try {
      localStorage.setItem(GHOST_MODE_STORAGE_KEY, JSON.stringify({ company: targetCompany, startedAt }))
    } catch { /* ignore — session still works in-memory for this tab */ }
    logAdminActivity({
      accountId: targetCompany.id,
      actorId: user?.id ?? null,
      actionType: 'ghost_mode_entered',
      description: `Entered Ghost Mode for ${targetCompany.name}`,
    })
  }, [user])

  const exitGhostMode = useCallback((reason: 'manual' | 'timeout' = 'manual') => {
    if (!impersonatedCompany) return
    const durationMs = impersonatedAt ? Date.now() - impersonatedAt : null
    logAdminActivity({
      accountId: impersonatedCompany.id,
      actorId: user?.id ?? null,
      actionType: 'ghost_mode_exited',
      description: reason === 'timeout'
        ? `Ghost session for ${impersonatedCompany.name} ended after timeout`
        : `Exited Ghost Mode for ${impersonatedCompany.name}`,
      metadata: { reason, durationMs },
    })
    setImpersonatedCompany(null)
    setImpersonatedAt(null)
    clearGhostStorage()
  }, [impersonatedCompany, impersonatedAt, user, clearGhostStorage])

  const effectiveCompany = impersonatedCompany ?? company
  const platformRole: PlatformRole = (userProfile?.platform_role as PlatformRole) ?? 'user'
  const isOwnerUser = platformRole === 'super_admin'

  // Enforce the safety timeout while a ghost session is actively open in this tab
  // (the on-mount restore effect handles the case where the app loads directly
  // into an already-expired session).
  useEffect(() => {
    if (!impersonatedCompany || !impersonatedAt) return
    const remaining = GHOST_MODE_TIMEOUT_MS - (Date.now() - impersonatedAt)
    if (remaining <= 0) {
      exitGhostMode('timeout')
      return
    }
    const timer = setTimeout(() => exitGhostMode('timeout'), remaining)
    return () => clearTimeout(timer)
  }, [impersonatedCompany, impersonatedAt, exitGhostMode])

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      company,
      impersonatedCompany,
      impersonatedAt,
      enterGhostMode,
      exitGhostMode,
      effectiveCompany,
      platformRole,
      companyRole,
      isCompanyOwner,
      isOwnerUser,
      loading,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function createFakeAuthContext(opts?: {
  inspectorName?: string
  companyId?: string
} & Partial<AuthContextValue>): AuthContextValue {
  const { inspectorName, companyId, ...overrides } = opts ?? {}

  const fakeCompany: Company | null = companyId ? {
    id: companyId, name: 'Remote', slug: null,
    subscription_tier: 'starter', reports_used: 0, reports_included: 30,
    billing_cycle_start: new Date().toISOString(),
    stripe_customer_id: null, account_type: 'standard',
    legacy_pricing: false, billing_interval: 'monthly',
  } : null

  const fakeProfile: UserProfile | null = inspectorName ? {
    id: 'remote-inspector', full_name: inspectorName, email: null,
    role: 'inspector', platform_role: 'user',
    company_id: companyId ?? null, employee_id: null,
    location_assignments: null, default_location: null,
  } : null

  return {
    user: null, userProfile: fakeProfile, company: fakeCompany,
    impersonatedCompany: null, impersonatedAt: null,
    enterGhostMode: () => {}, exitGhostMode: () => {},
    effectiveCompany: fakeCompany,
    platformRole: 'user', companyRole: null,
    isCompanyOwner: false, isOwnerUser: false, loading: false,
    signOut: async () => {}, refreshProfile: async () => {},
    ...overrides,
  }
}
