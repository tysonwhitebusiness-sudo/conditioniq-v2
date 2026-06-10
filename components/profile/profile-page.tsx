'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Shield, LogOut, ChevronRight, CreditCard, Users } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const { user, userProfile, effectiveCompany, isOwnerUser, signOut } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const name = userProfile?.full_name ?? user?.email ?? 'User'
  const initials = name.slice(0, 2).toUpperCase()
  const role = userProfile?.role ?? 'inspector'
  const used = effectiveCompany?.reports_used ?? 0
  const included = effectiveCompany?.reports_included ?? 0
  const isUnlimited = included >= 9999
  const usagePct = isUnlimited ? 8 : Math.min(100, included > 0 ? (used / included) * 100 : 0)
  const barColor = usagePct >= 100 ? '#EF4444' : usagePct >= 80 ? '#F59E0B' : '#00B4D8'

  return (
    <div className={isDesktop ? 'min-h-screen' : 'min-h-screen pb-24'} style={{ background: '#F0F4F8' }}>

      {/* Mobile header — hidden on desktop */}
      {!isDesktop && (
        <div className="px-4 pt-12 pb-6" style={{ background: '#0D1B2A' }}>
          <h1 className="text-white font-bold text-xl">My Profile</h1>
        </div>
      )}

      <div style={{ padding: isDesktop ? 24 : undefined }} className={isDesktop ? 'space-y-4' : 'px-4 pt-4 space-y-4'}>
        {/* Profile card */}
        <div className="rounded-2xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E1E8F0' }}>
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: '#00B4D8' }}
            >
              <span className="text-white font-black text-2xl">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-lg leading-tight truncate" style={{ color: '#0D1B2A' }}>{name}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                  style={
                    isOwnerUser
                      ? { background: '#0D1B2A', color: '#FFFFFF' }
                      : { background: '#E0F7FC', color: '#0097B2' }
                  }
                >
                  {isOwnerUser ? 'OWNER' : role.toUpperCase()}
                </span>
              </div>
              <p className="text-xs mt-1 truncate" style={{ color: '#94A3B8' }}>{effectiveCompany?.name ?? '—'}</p>
              <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Personal details */}
        <Section label="Personal Details">
          <Row label="Full Name" value={userProfile?.full_name ?? '—'} />
          <Row label="Email" value={user?.email ?? '—'} />
          <Row label="Employee ID" value={userProfile?.employee_id ?? '—'} />
          <Row label="Default Location" value={userProfile?.default_location ?? '—'} />
        </Section>

        <Section label="Work & Permissions">
          <Row label="Role" value={role.charAt(0).toUpperCase() + role.slice(1)} />
          <Row label="Company" value={effectiveCompany?.name ?? '—'} />
        </Section>

        {/* Owner extras */}
        {isOwnerUser && (
          <>
            <Section label="Plan & Billing">
              <div className="px-5 py-3 border-t" style={{ borderColor: '#F0F4F8' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: '#4A5568' }}>Plan</span>
                  <span className="text-sm font-bold" style={{ color: '#0D1B2A' }}>
                    {(effectiveCompany?.subscription_tier ?? 'starter').toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: '#4A5568' }}>Usage</span>
                  <span className="text-sm font-bold" style={{ color: '#0D1B2A' }}>
                    {used} / {isUnlimited ? '∞' : included}
                  </span>
                </div>
                <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: '#F0F4F8' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${usagePct}%`, background: barColor }} />
                </div>
              </div>
            </Section>

            <div className="space-y-2">
              <ActionRow
                icon={<Shield size={18} className="text-white" />}
                iconStyle={{ background: '#0D1B2A' }}
                label="Admin Center"
                sublabel="Manage organizations & platform"
                onClick={() => router.push('/admin/overview')}
              />
              <ActionRow
                icon={<Users size={18} style={{ color: '#00B4D8' }} />}
                iconStyle={{ background: '#E0F7FC' }}
                label="Team Management"
                sublabel="View and manage team members"
              />
              <ActionRow
                icon={<CreditCard size={18} style={{ color: '#F4A62A' }} />}
                iconStyle={{ background: '#FEF3C7' }}
                label="Billing"
                sublabel="Manage subscription and payment"
              />
            </div>
          </>
        )}

        {/* Sign out */}
        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 py-4 font-bold text-sm rounded-2xl border"
          style={{ color: '#EF4444', border: '1px solid #FEE2E2', background: '#FFFFFF' }}
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E1E8F0' }}>
      <p className="text-[11px] font-bold uppercase tracking-wider px-5 pt-4 pb-1" style={{ color: '#94A3B8' }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: '#F0F4F8' }}>
      <span className="text-sm" style={{ color: '#4A5568' }}>{label}</span>
      <span className="text-sm font-semibold text-right max-w-[55%] truncate" style={{ color: '#0D1B2A' }}>{value}</span>
    </div>
  )
}

function ActionRow({ icon, iconStyle, label, sublabel, onClick }: {
  icon: React.ReactNode
  iconStyle: React.CSSProperties
  label: string
  sublabel: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl px-4 py-4 flex items-center gap-4 text-left transition-colors active:opacity-80"
      style={{ background: '#FFFFFF', border: '1px solid #E1E8F0' }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={iconStyle}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm" style={{ color: '#0D1B2A' }}>{label}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: '#94A3B8' }}>{sublabel}</p>
      </div>
      <ChevronRight size={16} style={{ color: '#E1E8F0', flexShrink: 0 }} />
    </button>
  )
}
