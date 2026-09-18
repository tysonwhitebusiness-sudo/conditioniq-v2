import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RawCompanyRole } from '@/lib/roles'

export interface AuthBootstrap {
  user: any | null
  userProfile: any | null
  company: any | null
  rawRole: RawCompanyRole | null
}

// L2 · Instant feel.
//
// The browser used to open every screen by asking three questions in a row —
// session, then profile, then company and role — before the screen could even
// start loading its own data. The server already has the session cookie, so it
// answers all three here while the page renders, and the auth context starts
// with the answers instead of a spinner.
//
// Profile and company come back in one query through the foreign key; the role
// needs the admin client because the browser's policy hides company_members.
export async function getAuthBootstrap(): Promise<AuthBootstrap> {
  const empty: AuthBootstrap = { user: null, userProfile: null, company: null, rawRole: null }
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return empty

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*, companies(*)')
      .eq('id', user.id)
      .single()

    if (!profile) return { ...empty, user }

    const { companies, ...userProfile } = profile as Record<string, any>
    const company = companies ?? null

    let rawRole: RawCompanyRole | null = null
    if (userProfile.company_id) {
      const { data: member } = await createAdminClient()
        .from('company_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', userProfile.company_id)
        .maybeSingle()
      rawRole = (member?.role as RawCompanyRole) ?? null
    }

    return { user, userProfile, company, rawRole }
  } catch {
    // A failed bootstrap is not fatal: the context falls back to loading the
    // same data in the browser, exactly as it did before.
    return empty
  }
}
