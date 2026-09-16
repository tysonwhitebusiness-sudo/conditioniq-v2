'use client'

import { Car, AlertTriangle, Clock } from 'lucide-react'
import type { UsageState } from '@/lib/usage-actions'
import { PRIMARY, PRIMARY_LIGHT, WHITE, DANGER, DANGER_LIGHT, SCORE_CRITICAL_TEXT, WARN, WARN_LIGHT, WARN_DARK, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

interface Props {
  usageState: UsageState
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export default function UsageConfirmationModal({ usageState, onConfirm, onCancel, loading }: Props) {
  const pct = usageState.percentUsed
  const isOverage = usageState.isOverage
  const isWarning = !isOverage && pct >= 80

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(13,27,42,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: WHITE, borderRadius: 20, width: '100%', maxWidth: 380,
        padding: 24, boxShadow: '0 20px 60px rgba(13,27,42,0.2)',
      }}>
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          {isOverage ? (
            <div style={{ width: 56, height: 56, borderRadius: 28, background: DANGER_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={28} color={DANGER} />
            </div>
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 28, background: PRIMARY_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={28} color={PRIMARY} />
            </div>
          )}
        </div>

        {/* Title */}
        <h2 style={{ fontSize: 20, fontWeight: 700, color: GRAY_900, textAlign: 'center', margin: '0 0 8px' }}>
          {isOverage ? 'Plan limit reached' : 'Start Inspection?'}
        </h2>

        {/* Subtitle */}
        <p style={{ fontSize: 14, color: GRAY_700, textAlign: 'center', margin: '0 0 4px', lineHeight: 1.5 }}>
          {isOverage
            ? `You've used all ${usageState.included} reports this month.`
            : `Completing this inspection will use 1 report from your ${usageState.planName} plan.`}
        </p>
        {isOverage && (
          <p style={{ fontSize: 14, color: GRAY_700, textAlign: 'center', margin: '0 0 16px', lineHeight: 1.5 }}>
            Completing this inspection will be billed as an overage at ${usageState.overageRate.toFixed(2)}.
          </p>
        )}

        {/* Warning strip — 80–100% */}
        {isWarning && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: WARN_LIGHT, border: `1px solid ${WARN}`, borderRadius: 10, marginBottom: 16,
          }}>
            <AlertTriangle size={16} color={WARN} style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: WARN_DARK, margin: 0 }}>
              You've used {Math.round(pct)}% of your monthly limit.
            </p>
          </div>
        )}

        {/* Overage rate card — 100%+ */}
        {isOverage && (
          <div style={{
            background: DANGER_LIGHT, borderRadius: 10, padding: '12px 16px', marginBottom: 16, textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: SCORE_CRITICAL_TEXT, margin: 0 }}>
              Overage rate: ${usageState.overageRate.toFixed(2)} per report
            </p>
          </div>
        )}

        {/* Usage bar — under 100% */}
        {!isOverage && (
          <div style={{ background: GRAY_100, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: GRAY_700 }}>Reports used</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: GRAY_900 }}>{usageState.used} / {usageState.included}</span>
            </div>
            <div style={{ height: 6, background: GRAY_300, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: 6, borderRadius: 3,
                background: isWarning ? WARN : PRIMARY,
                width: `${Math.min(100, pct)}%`,
                transition: 'width 300ms',
              }} />
            </div>
            <p style={{ fontSize: 13, color: GRAY_700, margin: '8px 0 0' }}>
              {usageState.remaining} report{usageState.remaining !== 1 ? 's' : ''} remaining this month.
            </p>
          </div>
        )}

        {/* 24-hour expiry notice */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: GRAY_100, borderRadius: 10, padding: '10px 14px', marginBottom: 16,
        }}>
          <Clock size={15} color={GRAY_500} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: GRAY_700, margin: 0, lineHeight: 1.5 }}>
            You have <strong style={{ color: GRAY_900 }}>24 hours</strong> to complete this inspection. If left inactive, it will be auto-cancelled at no charge.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              height: 52, borderRadius: 12, border: 'none',
              fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
              background: isOverage ? DANGER : PRIMARY,
              color: WHITE,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Starting…' : isOverage ? 'Confirm Overage & Start' : 'Confirm & Start'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              height: 48, borderRadius: 12, background: WHITE,
              border: `1.5px solid ${GRAY_300}`, color: GRAY_700,
              fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
