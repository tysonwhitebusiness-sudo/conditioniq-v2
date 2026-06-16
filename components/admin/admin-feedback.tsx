'use client'

import { useState, useEffect } from 'react'
import { getAllFeedback, updateFeedbackStatus, getScreenshotSignedUrl, type CustomerFeedback, type FeedbackCategory, type FeedbackStatus } from '@/lib/feedback-actions'
import { ChevronDown, ChevronUp, ExternalLink, MessageSquare } from 'lucide-react'

const CATEGORY_CFG: Record<FeedbackCategory, { label: string; bg: string; color: string }> = {
  bug:             { label: 'Bug',            bg: '#FEE2E2', color: '#991B1B' },
  feature_request: { label: 'Feature Request', bg: '#EEF2FF', color: '#3730A3' },
  question:        { label: 'Question',        bg: '#F0F9FF', color: '#0369A1' },
}

const STATUS_CFG: Record<FeedbackStatus, { label: string; bg: string; color: string }> = {
  new:       { label: 'New',       bg: '#FEF3C7', color: '#92400E' },
  in_review: { label: 'In Review', bg: '#E0F7FC', color: '#0097B2' },
  resolved:  { label: 'Resolved',  bg: '#D1FAE5', color: '#065F46' },
}

export default function AdminFeedback() {
  const [feedback, setFeedback] = useState<CustomerFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({})
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | ''>('')
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | ''>('')

  const load = async () => {
    setLoading(true)
    const data = await getAllFeedback({
      category: categoryFilter,
      status: statusFilter,
    })
    setFeedback(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [categoryFilter, statusFilter])

  const handleStatusChange = async (id: string, newStatus: FeedbackStatus) => {
    await updateFeedbackStatus(id, newStatus)
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f))
  }

  const handleExpand = async (item: CustomerFeedback) => {
    if (expandedId === item.id) { setExpandedId(null); return }
    setExpandedId(item.id)
    if (item.screenshot_url && !screenshotUrls[item.id]) {
      const url = await getScreenshotSignedUrl(item.screenshot_url)
      if (url) setScreenshotUrls(prev => ({ ...prev, [item.id]: url }))
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <MessageSquare size={22} color="#00B4D8" />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Customer Feedback</h1>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8' }}>({feedback.length})</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value as FeedbackCategory | '')}
          style={{ height: 38, padding: '0 10px', border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">All Categories</option>
          <option value="bug">Bug</option>
          <option value="feature_request">Feature Request</option>
          <option value="question">Question</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as FeedbackStatus | '')}
          style={{ height: 38, padding: '0 10px', border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="in_review">In Review</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 72, background: '#E2E8F0', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
      ) : feedback.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <MessageSquare size={32} color="#94A3B8" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#0D1B2A', margin: '0 0 4px' }}>No feedback yet</p>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Feedback submitted by customers will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {feedback.map(item => {
            const cat = CATEGORY_CFG[item.category] ?? CATEGORY_CFG.bug
            const st = STATUS_CFG[item.status] ?? STATUS_CFG.new
            const isExpanded = expandedId === item.id
            const dateStr = new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            const companyName = (item.company as any)?.name ?? item.company_id ?? '—'
            const submitterName = (item.user as any)?.full_name ?? (item.user as any)?.email ?? '—'
            const screenshotUrl = screenshotUrls[item.id]

            return (
              <div
                key={item.id}
                style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(13,27,42,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                {/* Row */}
                <div
                  onClick={() => handleExpand(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}
                >
                  {/* Category badge */}
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: cat.bg, color: cat.color, whiteSpace: 'nowrap' }}>
                    {cat.label.toUpperCase()}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </p>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                      {companyName} · {dateStr}
                    </p>
                  </div>

                  {/* Status dropdown */}
                  <select
                    value={item.status}
                    onClick={e => e.stopPropagation()}
                    onChange={e => handleStatusChange(item.id, e.target.value as FeedbackStatus)}
                    style={{
                      flexShrink: 0,
                      height: 28,
                      padding: '0 6px',
                      border: `1px solid ${st.bg === '#FFF' ? '#E1E8F0' : st.bg}`,
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      background: st.bg,
                      color: st.color,
                      fontFamily: 'inherit',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="new">New</option>
                    <option value="in_review">In Review</option>
                    <option value="resolved">Resolved</option>
                  </select>

                  {isExpanded ? <ChevronUp size={16} color="#94A3B8" style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color="#94A3B8" style={{ flexShrink: 0 }} />}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '0 18px 16px', borderTop: '1px solid #F0F4F8' }}>
                    <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Full description */}
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Description</p>
                        <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.description}</p>
                      </div>

                      {/* Meta */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Submitted by</p>
                          <p style={{ fontSize: 13, color: '#0D1B2A', margin: 0 }}>{submitterName}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Page</p>
                          {item.page_url ? (
                            <a
                              href={item.page_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 13, color: '#00B4D8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              <ExternalLink size={12} style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.page_url.replace(/^https?:\/\/[^/]+/, '')}</span>
                            </a>
                          ) : (
                            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>—</p>
                          )}
                        </div>
                      </div>

                      {/* Screenshot */}
                      {item.screenshot_url && (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Screenshot</p>
                          {screenshotUrl ? (
                            <a href={screenshotUrl} target="_blank" rel="noreferrer">
                              <img
                                src={screenshotUrl}
                                alt="feedback screenshot"
                                style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 10, border: '1px solid #E1E8F0', display: 'block', objectFit: 'contain', cursor: 'pointer' }}
                              />
                            </a>
                          ) : (
                            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Loading…</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
