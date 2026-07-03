'use client'

import { X, Bell, Mail, ChevronRight } from 'lucide-react'
import { dismissBillingNotification, type BillingNotification } from '@/lib/billing-notification-actions'

interface Props {
  notification: BillingNotification
  userEmail: string | null
  appUrl: string
  onDismiss: () => void
  onReview: () => void
}

export default function BillingReminderBanner({
  notification, userEmail, appUrl, onDismiss, onReview,
}: Props) {
  async function handleDismiss() {
    await dismissBillingNotification(notification.id)
    onDismiss()
  }

  function handleReview() {
    dismissBillingNotification(notification.id) // fire-and-forget
    onReview()
  }

  const mailtoBody = [
    `Billing Reminder — ${notification.title}`,
    '',
    notification.message,
    '',
    `Review unbilled units: ${appUrl}/lot-billing`,
  ].join('\n')

  const mailtoHref = userEmail
    ? `mailto:${userEmail}?subject=${encodeURIComponent(notification.title)}&body=${encodeURIComponent(mailtoBody)}`
    : null

  return (
    <div style={{
      background: '#1B2D40',
      borderRadius: 14,
      padding: '14px 16px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      {/* Icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: 'rgba(244,166,42,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Bell size={16} color="#F4A62A" />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', margin: '0 0 2px' }}>
          {notification.title}
        </p>
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
          {notification.message}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {mailtoHref && (
          <a
            href={mailtoHref}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: '#94A3B8', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            <Mail size={12} />
            Email myself
          </a>
        )}
        <button
          onClick={handleReview}
          style={{
            height: 32, padding: '0 14px', borderRadius: 8,
            border: 'none', background: '#F4A62A',
            color: '#0D1B2A', fontSize: 12, fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap',
          }}
        >
          Review <ChevronRight size={12} />
        </button>
        <button
          onClick={handleDismiss}
          style={{
            width: 28, height: 28, borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <X size={13} color="#64748B" />
        </button>
      </div>
    </div>
  )
}
