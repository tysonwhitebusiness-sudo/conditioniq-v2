'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { PlatformRole, CompanyRole } from '@/lib/roles'
import { getUserCompanyRole } from '@/lib/auth-server-actions'

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

interface Company {
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
  setImpersonatedCompany: (c: Company | null) => void
  effectiveCompany: Company | null
  platformRole: PlatformRole
  companyRole: CompanyRole | null
  isOwnerUser: boolean  // kept for backward compat — true when platformRole === 'super_admin'
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  userProfile: null,
  company: null,
  impersonatedCompany: null,
  setImpersonatedCompany: () => {},
  effectiveCompany: null,
  platformRole: 'user',
  companyRole: null,
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
  const [impersonatedCompany, setImpersonatedCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (u: User) => {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', u.id)
      .single()

    setUserProfile(profile ?? null)

    if (profile?.company_id) {
      const [compRes, memberRole] = await Promise.all([
        supabase.from('companies').select('*').eq('id', profile.company_id).single(),
        getUserCompanyRole(u.id, profile.company_id),
      ])
      setCompany(compRes.data ?? null)
      setCompanyRole(memberRole)
    } else {
      setCompany(null)
      setCompanyRole(null)
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
        setImpersonatedCompany(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user)
  }, [user, loadProfile])

  const effectiveCompany = impersonatedCompany ?? company
  const platformRole: PlatformRole = (userProfile?.platform_role as PlatformRole) ?? 'user'
  const isOwnerUser = platformRole === 'super_admin'

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      company,
      impersonatedCompany,
      setImpersonatedCompany,
      effectiveCompany,
      platformRole,
      companyRole,
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
    impersonatedCompany: null, setImpersonatedCompany: () => {},
    effectiveCompany: fakeCompany,
    platformRole: 'user', companyRole: null,
    isOwnerUser: false, loading: false,
    signOut: async () => {}, refreshProfile: async () => {},
    ...overrides,
  }
}
