import { createClient } from '@/lib/supabase/server'

if (typeof window !== 'undefined') throw new Error('lib/ai/admin-auth is server-only')

// Who may see and change platform-wide AI settings: the platform owner and
// platform admins. A plain server module rather than a server action, so it
// can be used by actions without becoming callable from the browser.

export async function currentUserId(): Promise<string | null> {
  const { data: { user } } = await createClient().auth.getUser()
  return user?.id ?? null
}

export async function isPlatformAdmin(): Promise<boolean> {
  const session = createClient()
  const [{ data: owner }, { data: admin }] = await Promise.all([session.rpc('is_platform_owner'), session.rpc('is_admin')])
  return Boolean(owner) || Boolean(admin)
}
