'use client'

import { useMemo } from 'react'

export function getNextTouchNumber(lead: any): number | null {
  const touches: any[] = lead.crm_email_touches ?? []
  if (touches.length === 0) return 1

  const sortedTouches = [...touches].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
  const hasReplied = touches.some(t => t.replied)

  if (hasReplied || touches.length >= 3) return null

  if (touches.length === 1) {
    const daysSinceTouch1 = (Date.now() - new Date(sortedTouches[0].sent_at).getTime()) / 86400000
    return daysSinceTouch1 >= 5 ? 2 : null
  }

  if (touches.length === 2) {
    const daysSinceTouch2 = (Date.now() - new Date(sortedTouches[1].sent_at).getTime()) / 86400000
    return daysSinceTouch2 >= 7 ? 3 : null
  }

  return null
}

export function useQueueFilters(leads: any[]) {
  return useMemo(() => {
    const filtered = leads.filter(lead => !['converted', 'not_interested'].includes(lead.status))
    const sorted = [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    const stages = {
      new: sorted.filter(l => l.status === 'new'),
      day5Due: sorted.filter(l => getNextTouchNumber(l) === 2),
      day12Due: sorted.filter(l => getNextTouchNumber(l) === 3),
      awaitingReply: sorted.filter(l => {
        const touches = l.crm_email_touches ?? []
        return touches.length > 0 && !touches.some((t: any) => t.replied) && getNextTouchNumber(l) === null
      }),
      demoSent: sorted.filter(l => l.status === 'demo_sent'),
      trialActive: sorted.filter(l => l.status === 'trial_active'),
      converted: leads.filter(l => l.status === 'converted'),
    }

    return { filtered: sorted, stages }
  }, [leads])
}
