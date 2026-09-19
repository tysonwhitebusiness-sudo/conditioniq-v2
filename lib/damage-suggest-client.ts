'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { listDamageSuggestions, rejectDamageSuggestion, type DamageSuggestion } from './damage-server-actions'

// F · The damage suggestions for the inspection being worked on, shared by the
// exterior step's notice and the panel above the damage diagram.
//
// A check starts when an exterior photo finishes uploading and runs in the
// background. Checks for the same slot run one after another, so a retake is
// always checked after the photo it replaced. Nothing waits on them.

export type { DamageSuggestion }

interface State {
  inspectionId: string | null
  suggestions: DamageSuggestion[]
  checking: number
}

let state: State = { inspectionId: null, suggestions: [], checking: 0 }
const listeners = new Set<() => void>()
const slotQueues = new Map<string, Promise<unknown>>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}

function switchInspection(inspectionId: string) {
  if (state.inspectionId !== inspectionId) {
    state = { inspectionId, suggestions: [], checking: 0 }
    slotQueues.clear()
  }
}

async function refresh(inspectionId: string) {
  try {
    const suggestions = await listDamageSuggestions(inspectionId)
    if (state.inspectionId === inspectionId) set({ suggestions })
  } catch { /* the panel keeps what it had */ }
}

/** Check a just-uploaded exterior photo for damage, in the background. */
export function requestDamageCheck(inspectionId: string, slot: string) {
  switchInspection(inspectionId)
  set({ checking: state.checking + 1 })
  const previous = slotQueues.get(slot) ?? Promise.resolve()
  const run = previous.then(() =>
    fetch('/api/damage-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionId, slot }),
    }).catch(() => null),
  ).then(() => refresh(inspectionId)).finally(() => {
    if (state.inspectionId === inspectionId) set({ checking: Math.max(0, state.checking - 1) })
  })
  slotQueues.set(slot, run)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => state

export function useDamageSuggestions(inspectionId: string) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)

  useEffect(() => {
    switchInspection(inspectionId)
    refresh(inspectionId)
  }, [inspectionId])

  const mine = current.inspectionId === inspectionId
  const reject = useCallback(async (id: string) => {
    set({ suggestions: state.suggestions.filter(s => s.id !== id) })
    try { await rejectDamageSuggestion(inspectionId, id) } catch { refresh(inspectionId) }
  }, [inspectionId])
  /** Drop a suggestion from the list once its pin is saved. */
  const settle = useCallback((id: string) => {
    set({ suggestions: state.suggestions.filter(s => s.id !== id) })
  }, [])

  return {
    suggestions: mine ? current.suggestions : [],
    checking: mine ? current.checking > 0 : false,
    reject,
    settle,
  }
}
