'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { User, CreditCard, Users, Palette, DollarSign, ChevronRight, Lock, Sparkles } from 'lucide-react'

interface SettingsCard {
  icon: React.ReactNode
  title: string
  description: string
  lockedLabel: string
  route: string
  accessible: boolean
}

export default function SettingsPage() {
  const router = useRouter()
  const { isOwnerUser, companyRole, loading } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const lotMapEnabled = useFeatureFlag('lot_map')
  const whiteLabelEnabled = useFeatureFlag('white_label')

  const isAdmin = isOwnerUser || companyRole === 'admin'

  const cards: SettingsCard[] = [
    {
      icon: <User size={20} />,
      title: 'Profile',
      description: 'Update your name, email, and password',
      lockedLabel: '',
      route: '/settings/profile',
      accessible: true,
    },
    {
      icon: <CreditCard size={20} />,
      title: 'Billing & Plan',
      description: 'View your plan, usage, and invoices',
      lockedLabel: '',
      route: '/settings/billing',
      accessible: true,
    },
    {
      icon: <Users size={20} />,
      title: 'Team Members',
      description: 'Manage who has access to your account',
      lockedLabel: 'Admin access required',
      route: '/settings/members',
      accessible: isAdmin,
    },
    {
      icon: <Palette size={20} />,
      title: 'Branding',
      description: 'Upload your logo and customize report appearance',
      lockedLabel: !isAdmin ? 'Admin access required' : 'Contact us to enable',
      route: '/settings/branding',
      accessible: isAdmin && !!whiteLabelEnabled,
    },
    {
      icon: <DollarSign size={20} />,
      title: 'Lot Billing',
      description: 'Set default storage rates for your lot',
      lockedLabel: !isAdmin ? 'Admin access required' : 'Contact us to enable',
      route: '/settings/lot-billing',
      accessible: isAdmin && !!lotMapEnabled,
    },
  ]

  if (loading) return null

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{
        padding: isDesktop ? '28px 32px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 800, margin: '0 auto',
      }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: isDesktop ? 22 : 20, fontWeight: 800, color: '#0D1B2A', margin: '0 0 4px' }}>Settings</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Manage your account and preferences</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr',
          gap: 12,
        }}>
          {cards.map(card => (
            <button
              key={card.route}
              onClick={() => card.accessible && router.push(card.route)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                background: '#FFFFFF', border: '1px solid #E1E8F0',
                borderRadius: 16, padding: '18px 20px',
                cursor: card.accessible ? 'pointer' : 'default',
                textAlign: 'left', width: '100%', fontFamily: 'inherit',
                opacity: card.accessible ? 1 : 0.6,
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: card.accessible ? '#E0F7FC' : '#F0F4F8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: card.accessible ? '#0097B2' : '#94A3B8',
              }}>
                {card.accessible ? card.icon : <Lock size={18} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: card.accessible ? '#0D1B2A' : '#6B7280', margin: '0 0 3px' }}>
                  {card.title}
                </p>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
                  {card.accessible ? card.description : card.lockedLabel}
                </p>
              </div>
              {card.accessible
                ? <ChevronRight size={18} color="#CBD5E1" style={{ flexShrink: 0 }} />
                : <Lock size={14} color="#CBD5E1" style={{ flexShrink: 0 }} />}
            </button>
          ))}
        </div>

        {/* What's New */}
        <div style={{ marginTop: 20 }}>
          <Link
            href="/changelog"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#FFFFFF', border: '1px solid #E1E8F0',
              borderRadius: 16, padding: '16px 20px',
              textDecoration: 'none', color: 'inherit',
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: '#E0F7FC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0097B2' }}>
              <Sparkles size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: '0 0 3px' }}>What's New</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Latest updates and improvements</p>
            </div>
            <ChevronRight size={18} color="#CBD5E1" style={{ flexShrink: 0 }} />
          </Link>
        </div>

        <BottomNav />
      </div>
    </>
  )
}
