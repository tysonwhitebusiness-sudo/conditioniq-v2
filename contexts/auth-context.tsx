'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isOwner } from '@/lib/auth'
import type { User } from '@supabase/supabase-js'

interface UserProfile {
  id: string
  full_name: string | null
  email: string | null
  role: string
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
}

interface AuthContextValue {
  user: User | null
  userProfile: UserProfile | null
  company: Company | null
  impersonatedCompany: Company | null
  setImpersonatedCompany: (c: Company | null) => void
  effectiveCompany: Company | null
  isOwnerUser: boolean
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
      const { data: comp } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single()
      setCompany(comp ?? null)
    } else {
      setCompany(null)
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

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      company,
      impersonatedCompany,
      setImpersonatedCompany,
      effectiveCompany,
      isOwnerUser: isOwner(user),
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
    id: companyId,
    name: 'Remote',
    slug: null,
    subscription_tier: 'starter',
    reports_used: 0,
    reports_included: 30,
    billing_cycle_start: new Date().toISOString(),
    stripe_customer_id: null,
    account_type: 'standard',
  } : null

  const fakeProfile: UserProfile | null = inspectorName ? {
    id: 'remote-inspector',
    full_name: inspectorName,
    email: null,
    role: 'inspector',
    company_id: companyId ?? null,
    employee_id: null,
    location_assignments: null,
    default_location: null,
  } : null

  return {
    user: null,
    userProfile: fakeProfile,
    company: fakeCompany,
    impersonatedCompany: null,
    setImpersonatedCompany: () => {},
    effectiveCompany: fakeCompany,
    isOwnerUser: false,
    loading: false,
    signOut: async () => {},
    refreshProfile: async () => {},
    ...overrides,
  }
}
