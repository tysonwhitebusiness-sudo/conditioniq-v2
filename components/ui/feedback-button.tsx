'use client'

import { useState, useRef } from 'react'
import { MessageSquare, X, Paperclip, Check, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { submitFeedback, createScreenshotUploadUrl, type FeedbackCategory } from '@/lib/feedback-actions'
import { useMediaQuery } from '@/hooks/use-media-query'
import * as Sentry from '@sentry/nextjs'
import { sendEmail } from '@/lib/send-email'

const ADMIN_NOTIFY_EMAIL = process.env.NEXT_PUBLIC_FEEDBACK_NOTIFY_EMAIL ?? 'tysonwhitebusiness@gmail.com'

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'question', label: 'Question' },
]

const CATEGORY_COLOR: Record<FeedbackCategory, { bg: string; color: string; activeBg: string; activeColor: string }> = {
  bug:             { bg: '#FEF2F2', color: '#991B1B', activeBg: '#EF4444', activeColor: '#FFF' },
  feature_request: { bg: '#EEF2FF', color: '#3730A3', activeBg: '#6366F1', activeColor: '#FFF' },
  question:        { bg: '#F0F9FF', color: '#0369A1', activeBg: '#0EA5E9', activeColor: '#FFF' },
}

export default function FeedbackButton() {
  const { user, effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [description, setDescription] = useState('')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Only render for authenticated users in app context
  if (!user || !effectiveCompany) return null

  const reset = () => {
    setCategory('bug')
    setDescription('')
    setScreenshotFile(null)
    setSubmitted(false)
    setSubmitting(false)
  }

  const handleClose = () => {
    setOpen(false)
    setTimeout(reset, 300)
  }

  const handleSubmit = async () => {
    if (!description.trim() || submitting) return
    setSubmitting(true)

    try {
      let screenshotUrl: string | null = null

      // Upload screenshot if provided
      if (screenshotFile) {
        const ext = screenshotFile.name.split('.').pop() ?? 'png'
        const uploadInfo = await createScreenshotUploadUrl(effectiveCompany.id, ext)
        if (uploadInfo) {
          const { createClient } = await import('@/lib/supabase/client')
          const supabase = createClient()
          const { error } = await supabase.storage
            .from('feedback-screenshots')
            .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, screenshotFile)
          if (!error) screenshotUrl = uploadInfo.path
        }
      }

      const pageUrl = typeof window !== 'undefined' ? window.location.href : null

      const result = await submitFeedback({
        companyId: effectiveCompany.id,
        userId: user.id,
        category,
        description: description.trim(),
        screenshotUrl,
        pageUrl,
      })

      // Send to Sentry
      Sentry.captureFeedback({
        name: user.email ?? 'user',
        email: user.email ?? undefined,
        message: `[${category}] ${description.trim()}`,
        url: pageUrl ?? undefined,
        associatedEventId: result?.id,
      })

      // Email notification via existing sendEmail pattern
      const companyName = (effectiveCompany as any).name ?? effectiveCompany.id
      const categoryLabel = CATEGORIES.find(c => c.value === category)?.label ?? category
      sendEmail({
        to: ADMIN_NOTIFY_EMAIL,
        subject: `[Feedback: ${categoryLabel}] from ${companyName}`,
        body: `Category: ${categoryLabel}\nCompany: ${companyName}\nPage: ${pageUrl ?? 'unknown'}\n\n${description.trim()}`,
      })

      setSubmitted(true)
      setTimeout(handleClose, 2200)
    } catch (err) {
      console.error('[feedback] submit error', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Position: bottom-right on desktop; above BottomNav on mobile
  const buttonBottom = isDesktop ? 24 : 'calc(64px + env(safe-area-inset-bottom, 0px) + 12px)'

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Send feedback"
          style={{
            position: 'fixed',
            bottom: buttonBottom,
            right: isDesktop ? 24 : 16,
            zIndex: 90,
            width: 44,
            height: 44,
            borderRadius: 22,
            background: '#0D1B2A',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(13,27,42,0.25)',
            transition: 'transform 150ms, box-shadow 150ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.08)'
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(13,27,42,0.35)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(13,27,42,0.25)'
          }}
        >
          <MessageSquare size={19} color="#FFF" />
        </button>
      )}

      {/* Modal */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: isDesktop ? 24 : 'calc(64px + env(safe-area-inset-bottom, 0px) + 8px)',
          right: isDesktop ? 24 : 12,
          zIndex: 200,
          width: isDesktop ? 360 : 'calc(100vw - 24px)',
          maxWidth: 360,
          background: '#FFFFFF',
          borderRadius: 20,
          boxShadow: '0 8px 40px rgba(13,27,42,0.18)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 18px 14px',
            borderBottom: '1px solid #F0F4F8',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={16} color="#00B4D8" />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A' }}>Share Feedback</span>
            </div>
            <button
              onClick={handleClose}
              style={{ width: 28, height: 28, borderRadius: 14, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} color="#4A5568" />
            </button>
          </div>

          {submitted ? (
            <div style={{ padding: '32px 18px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Check size={24} color="#059669" />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 4px' }}>Thanks — we've got it.</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>We'll review your feedback shortly.</p>
            </div>
          ) : (
            <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Category selector */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Category</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CATEGORIES.map(c => {
                    const active = category === c.value
                    const col = CATEGORY_COLOR[c.value]
                    return (
                      <button
                        key={c.value}
                        onClick={() => setCategory(c.value)}
                        style={{
                          flex: 1,
                          height: 32,
                          borderRadius: 20,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          background: active ? col.activeBg : col.bg,
                          color: active ? col.activeColor : col.color,
                          transition: 'background 150ms, color 150ms',
                        }}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Description</p>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the issue or idea…"
                  rows={4}
                  style={{
                    width: '100%',
                    border: '1px solid #E1E8F0',
                    borderRadius: 12,
                    padding: '10px 12px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                    color: '#0D1B2A',
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {/* Screenshot upload */}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => setScreenshotFile(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 12px',
                    borderRadius: 10,
                    border: '1.5px dashed #E1E8F0',
                    background: screenshotFile ? '#F0FDF4' : '#FAFAFA',
                    color: screenshotFile ? '#059669' : '#94A3B8',
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <Paperclip size={13} />
                  {screenshotFile ? screenshotFile.name : 'Attach screenshot (optional)'}
                </button>
                {screenshotFile && (
                  <button
                    onClick={() => setScreenshotFile(null)}
                    style={{ marginTop: 4, fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!description.trim() || submitting}
                style={{
                  height: 44,
                  borderRadius: 12,
                  border: 'none',
                  background: !description.trim() || submitting ? '#E1E8F0' : '#00B4D8',
                  color: !description.trim() || submitting ? '#94A3B8' : '#FFF',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: !description.trim() || submitting ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {submitting ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Sending…</> : 'Send Feedback'}
              </button>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
        </div>
      )}
    </>
  )
}
