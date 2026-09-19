import type Anthropic from '@anthropic-ai/sdk'

// D · The AI half of the photo check: whether the photo shows what its slot
// asks for, and whether the subject is fully in frame. Pixels alone cannot
// tell either (blur and darkness are checked for free on the phone, in
// lib/photo-quality.ts). A small copy of the photo is enough, which keeps each
// check to a fraction of a cent. Never blocking: the inspector decides.

export const PHOTO_CHECK_VERSION = 'photo-check-v2'
export const PHOTO_CHECK_MODEL = 'claude-sonnet-5'
/** Longest edge of the copy sent; slot and framing do not need detail. */
export const PHOTO_CHECK_EDGE = 512

/** What each photo slot should show, in words the model can check against. */
export const SLOT_SUBJECT: Record<string, string> = {
  exteriorFrontPhoto: 'the front of the vehicle, seen from in front: grille, headlights and front bumper',
  exteriorRearPhoto: 'the rear of the vehicle, seen from behind: tail lights, rear bumper and trunk or tailgate',
  // Which side is shown is not asked: in testing the model could not tell the
  // driver's side from the passenger's (1 of 14), but it reliably tells a side
  // view from a front or rear one.
  exteriorDriverPhoto: 'one side of the vehicle, seen from the side (a side view, not the front or rear)',
  exteriorPassengerPhoto: 'one side of the vehicle, seen from the side (a side view, not the front or rear)',
  interiorDriverDoorPhoto: "the inside of the driver's door or the driver's seat area",
  interiorRearDriverDoorPhoto: 'the inside of the rear driver-side door or the rear seat behind the driver',
  interiorPassengerDoorPhoto: "the inside of the front passenger door or the passenger's seat area",
  interiorRearPassengerDoorPhoto: 'the inside of the rear passenger-side door or the rear seat on that side',
  interiorTrunkPhoto: 'the open trunk, cargo area or truck bed',
  dashboardPhoto: 'the dashboard or instrument cluster',
  engineBayPhoto: 'the engine compartment with the hood open',
  odometerPhoto: 'the odometer reading on the instrument cluster',
  licensePlatePhoto: 'a license plate',
  registrationPhoto: 'a vehicle registration document',
  insurancePhoto: 'a proof of insurance card or document',
  bolPhoto: 'a bill of lading document',
  keysPhoto: 'the vehicle keys or key fobs',
}

export interface PhotoCheck {
  /** The photo shows what the slot asks for. */
  rightSubject: boolean
  /** The subject is fully and sensibly in frame (not cut off or only a corner). */
  framed: boolean
  /** A short note for the inspector when either is false. */
  note: string
}

export const PHOTO_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    rightSubject: { type: 'boolean' },
    framed: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['rightSubject', 'framed', 'note'],
  additionalProperties: false,
}

export const PHOTO_CHECK_SYSTEM = [
  'You check photos taken during a vehicle inspection before the inspector keeps them.',
  'You are told what the photo should show. Answer two questions:',
  '- rightSubject: does the photo show that? Answer false only when it clearly shows something else (for example the rear instead of the front, or a different side of the vehicle).',
  '- framed: is the subject fully in view? Answer false when most of it is cut off or the photo shows only a small corner of it.',
  'note: when either answer is false, one short sentence for the inspector (at most 14 words) saying what is wrong; otherwise an empty string.',
  'Do not judge blur, lighting or damage.',
].join('\n')

export function photoCheckRequest(slotKey: string, imageBase64: string): { system: string; messages: Anthropic.MessageParam[] } | null {
  const subject = SLOT_SUBJECT[slotKey]
  if (!subject) return null
  return {
    system: PHOTO_CHECK_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: `This photo should show ${subject}.` },
      ],
    }],
  }
}

export function parsePhotoCheck(text: string): PhotoCheck | null {
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '')
    if (typeof j.rightSubject !== 'boolean' || typeof j.framed !== 'boolean') return null
    return { rightSubject: j.rightSubject, framed: j.framed, note: typeof j.note === 'string' ? j.note.trim() : '' }
  } catch {
    return null
  }
}
