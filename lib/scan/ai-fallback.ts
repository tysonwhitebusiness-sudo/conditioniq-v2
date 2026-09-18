import { runAi } from '@/lib/ai/client'

// S · The last resort for a VIN or plate the barcode and the text reader could
// not read. It goes through runAi, so the account switch, the kill switch and
// the inspection's spend ceiling all apply; a skipped call is simply no read.
// Whatever comes back is checked by the same rules as the other readers.

export const SCAN_PROMPT_VERSION = 'scan-v1'

const SYSTEM = [
  'You read vehicle identifiers from photos for a vehicle inspection app.',
  'Reply with JSON only, in the form {"value": string | null}.',
  'Return exactly the characters printed, uppercase, without spaces or punctuation.',
  'If the identifier is not clearly legible, return {"value": null}. Never guess a character you cannot see.',
].join(' ')

export async function readWithAi(opts: {
  kind: 'vin' | 'plate'
  imageJpeg: Buffer
  state?: string | null
  companyId: string | null
  inspectionId: string | null
}): Promise<string | null> {
  const ask = opts.kind === 'vin'
    ? 'Read the 17-character VIN in this photo (windshield plate, door-jamb label or barcode label). VINs never contain the letters I, O or Q.'
    : `Read the license plate number in this photo${opts.state ? ` (issued by ${opts.state})` : ''}. Ignore the state name, slogans, dealer frames, dates and badges.`

  const result = await runAi({
    feature: 'scan',
    promptVersion: SCAN_PROMPT_VERSION,
    companyId: opts.companyId,
    inspectionId: opts.inspectionId,
    system: SYSTEM,
    maxTokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: opts.imageJpeg.toString('base64') } },
        { type: 'text', text: ask },
      ],
    }],
  })
  if (!result.ok || result.message.stop_reason === 'refusal') return null
  const text = result.message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  try {
    const value = json ? JSON.parse(json).value : null
    return typeof value === 'string' && value.trim() ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : null
  } catch {
    return null
  }
}
