const OWNER_EMAILS = (process.env.NEXT_PUBLIC_OWNER_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export function isOwner(user: any): boolean {
  if (!user) return false
  const email = (user.email ?? user.user_metadata?.email ?? '').toLowerCase()
  return OWNER_EMAILS.includes(email)
}
