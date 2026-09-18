import type Anthropic from '@anthropic-ai/sdk'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { DAMAGE_GROUPS, SETS_DIR, type DamageItem } from './config'
import { readManifest, type Technique } from './harness'
import { DAMAGE_GUIDE, DAMAGE_GUIDE_VERSION } from '../../lib/ai/damage-guide'
import { DAMAGE_SYSTEM, DAMAGE_USER_TEXT } from '../../lib/ai/damage-setup'

// Example photos are shrunk to 512 px. Done in a child process because the
// technique builders are synchronous and sharp is not.
function sharpResize(path: string): string {
  return execFileSync(process.execPath, ['-e', `require('sharp')(${JSON.stringify(path)}).resize({width:512,height:512,fit:'inside'}).jpeg({quality:80}).toBuffer().then(b=>process.stdout.write(b.toString('base64')))`], { cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024 }).toString()
}

// B3 · The techniques compared head to head. Each builds on the last, and
// each is kept only if it scores better and stays inside the ceiling.

const GROUP_LIST = Object.entries(DAMAGE_GROUPS).map(([key, g]) => `- ${key}: ${g.label}`).join('\n')

const ANSWER_FORMAT = [
  'Reply with JSON only:',
  '{"damage": [{"group": "<one of the group keys>", "where": "<part of the vehicle>", "confidence": <0 to 1>}]}',
  'List each distinct damage once. If you see no damage, reply {"damage": []}.',
].join('\n')

const photo = (image: string): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } })

/** Step 1: a plain prompt. */
export const plain: Technique = {
  name: 'plain',
  promptVersion: 'damage-plain-v1',
  maxTokens: 400,
  build: (_item: DamageItem, image: string) => ({
    system: `You look at a photo of a vehicle and report visible damage.\n\nDamage groups:\n${GROUP_LIST}\n\n${ANSWER_FORMAT}`,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: [photo(image), { type: 'text', text: 'Report the damage in this photo.' }] }],
  }),
}

/** Step 2: the plain prompt plus the damage guide, cached across photos. */
export const guide: Technique = {
  name: 'guide',
  promptVersion: `damage-${DAMAGE_GUIDE_VERSION}`,
  maxTokens: 400,
  build: (_item: DamageItem, image: string) => ({
    system: [
      { type: 'text', text: `You look at a photo of a vehicle and report visible damage.\n\nDamage groups:\n${GROUP_LIST}\n\n${DAMAGE_GUIDE}` , cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ANSWER_FORMAT },
    ],
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: [photo(image), { type: 'text', text: 'Report the damage in this photo.' }] }],
  }),
}

// One labelled example per damage group, from the examples set only, small
// enough that seven of them cost about as much as one full-size photo.
let exampleBlocks: Anthropic.ContentBlockParam[] | null = null
function examples(): Anthropic.ContentBlockParam[] {
  if (exampleBlocks) return exampleBlocks
  const manifest = readManifest()
  const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: 'Examples of each damage group, with the correct answer:' }]
  for (const group of Object.keys(DAMAGE_GROUPS)) {
    const item = manifest.damage.examples.find(e => e.groups.length === 1 && e.groups[0] === group) ?? manifest.damage.examples.find(e => e.groups.includes(group as any))
    if (!item) continue
    const small = sharpResize(join(SETS_DIR, item.file))
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: small } })
    blocks.push({ type: 'text', text: `Answer: ${JSON.stringify({ damage: item.groups.map(g => ({ group: g, where: 'as shown', confidence: 0.9 })) })}` })
  }
  // The examples are the same for every photo, so they are cached after the first.
  const last = blocks[blocks.length - 1] as Anthropic.TextBlockParam
  last.cache_control = { type: 'ephemeral' }
  exampleBlocks = blocks
  return blocks
}

/** Step 3: guide plus one labelled example photo per damage group. */
export const withExamples: Technique = {
  name: 'examples',
  promptVersion: `damage-${DAMAGE_GUIDE_VERSION}-examples-v1`,
  maxTokens: 400,
  build: (item: DamageItem, image: string) => ({
    ...guide.build(item, image),
    messages: [{ role: 'user', content: [...examples(), { type: 'text', text: 'Now the photo to inspect:' }, photo(image), { type: 'text', text: 'Report the damage in this photo.' }] }],
  }),
}

// Step 4: prompt tuning from the tuning-set errors. The full guide made the
// model cautious (fewer scratches and dents found, no fewer false alarms), and
// holes were called tears. So: the plain prompt plus three short rules aimed at
// exactly those errors.
const TUNED_RULES = [
  'Report every damage you can see, including small ones. Confidence is how sure you are that it is real damage, not how serious it is.',
  'A hole through a panel, bumper or glass is "puncture" even when its edges are torn; use "tear" only for splits and cracks without a hole.',
  'Panel seams, door gaps, body lines, badges and reflections of trees, buildings or other vehicles are not damage.',
].map(r => `- ${r}`).join('\n')

export const tuned: Technique = {
  name: 'tuned',
  promptVersion: 'damage-tuned-v1',
  maxTokens: 400,
  // The winning setup lives in lib/ai/damage-setup.ts so the app uses exactly
  // what was measured; this builds the same request from it.
  build: (_item: DamageItem, image: string) => ({
    system: DAMAGE_SYSTEM,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: [photo(image), { type: 'text', text: DAMAGE_USER_TEXT }] }],
  }),
}

/** The tuned prompt with thinking on at low effort: does reasoning pay for its extra output? */
export const tunedThink: Technique = {
  name: 'tuned-think',
  promptVersion: 'damage-tuned-v1-think-low',
  maxTokens: 2000,
  build: (item: DamageItem, image: string) => ({
    ...tuned.build(item, image),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
  } as any),
}

export const TECHNIQUES: Record<string, Technique> = { plain, guide, examples: withExamples, tuned, 'tuned-think': tunedThink }
