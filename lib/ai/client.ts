import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODEL, costOf, worstCaseCost, fitsBudget, type BudgetState } from './pricing'

// A · The one way the app calls Claude.
//
// Server only: the key never reaches a browser. Every call goes through runAi,
// which checks, in order, the global kill switch, the account's AI switch, that
// a key is configured, and that the call's worst-case cost fits what is left of
// the inspection's ceiling. Anything that fails a check is skipped and logged;
// runAi never throws, so a feature built on it can never stop an inspection.

if (typeof window !== 'undefined') throw new Error('lib/ai/client is server-only')

export type AiFeature = 'scan' | 'photo_check' | 'gauges' | 'damage' | 'compare' | 'summary'

export interface AiRequest {
  feature: AiFeature
  /** Bumped whenever the prompt changes, so results can be compared by version. */
  promptVersion: string
  companyId: string | null
  inspectionId: string | null
  system: string
  messages: Anthropic.MessageParam[]
  maxTokens: number
  /** Off for reading and classifying, where thinking only adds cost. Adaptive when omitted. */
  thinking?: 'off' | 'adaptive'
  effort?: 'low' | 'medium' | 'high'
  /** A JSON schema the answer must follow, so it always parses. */
  jsonSchema?: Record<string, unknown>
}

export type AiResult =
  | { ok: true; message: Anthropic.Message; costUsd: number }
  | { ok: false; reason: 'kill_switch' | 'account_off' | 'ceiling' | 'not_configured' | 'error'; detail?: string }

let client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic()
  return client
}

async function loadSettings(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from('ai_settings').select('kill_switch, per_inspection_ceiling_usd, summary_reserve_usd').maybeSingle()
  return {
    killSwitch: data?.kill_switch ?? false,
    ceiling: Number(data?.per_inspection_ceiling_usd ?? 0.1),
    summaryReserve: Number(data?.summary_reserve_usd ?? 0.02),
  }
}

async function spentOn(admin: ReturnType<typeof createAdminClient>, inspectionId: string | null): Promise<number> {
  if (!inspectionId) return 0
  const { data } = await admin.from('ai_calls').select('cost_usd').eq('inspection_id', inspectionId)
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0)
}

/** Input tokens for the request, counted by the API; a generous estimate if counting fails. */
async function inputTokens(anthropic: Anthropic, req: AiRequest): Promise<number> {
  try {
    const counted = await anthropic.messages.countTokens({ model: AI_MODEL, system: req.system, messages: req.messages })
    return counted.input_tokens
  } catch {
    // Four characters a token, doubled, and a full-size image allowance per image.
    const text = req.system.length + JSON.stringify(req.messages).length
    const images = JSON.stringify(req.messages).split('"type":"image"').length - 1
    return Math.ceil(text / 2) + images * 5000
  }
}

export async function runAi(req: AiRequest): Promise<AiResult> {
  const admin = createAdminClient()
  const started = Date.now()
  const log = (row: Record<string, unknown>) =>
    admin.from('ai_calls').insert({
      company_id: req.companyId,
      inspection_id: req.inspectionId,
      feature: req.feature,
      model: AI_MODEL,
      prompt_version: req.promptVersion,
      duration_ms: Date.now() - started,
      ...row,
    }).then(({ error }) => { if (error) console.error('[ai] could not log call', error.message) })

  try {
    const settings = await loadSettings(admin)
    if (settings.killSwitch) { await log({ status: 'skipped_kill_switch' }); return { ok: false, reason: 'kill_switch' } }

    if (req.companyId) {
      const { data: company } = await admin.from('companies').select('ai_enabled').eq('id', req.companyId).maybeSingle()
      if (company && company.ai_enabled === false) { await log({ status: 'skipped_account_off' }); return { ok: false, reason: 'account_off' } }
    }

    const anthropic = getClient()
    if (!anthropic) { await log({ status: 'skipped_not_configured' }); return { ok: false, reason: 'not_configured' } }

    const tokensIn = await inputTokens(anthropic, req)
    const worstCase = worstCaseCost(AI_MODEL, tokensIn, req.maxTokens)
    const budget: BudgetState = { ceiling: settings.ceiling, summaryReserve: settings.summaryReserve, spent: await spentOn(admin, req.inspectionId) }
    if (!fitsBudget(budget, worstCase, req.feature === 'summary')) {
      await log({ status: 'skipped_ceiling', worst_case_usd: worstCase })
      return { ok: false, reason: 'ceiling' }
    }

    // Reserve the worst case before sending, so a second call for the same
    // inspection running at the same time sees it as already spent.
    const { data: reserved } = await admin.from('ai_calls').insert({
      company_id: req.companyId,
      inspection_id: req.inspectionId,
      feature: req.feature,
      model: AI_MODEL,
      prompt_version: req.promptVersion,
      status: 'pending',
      worst_case_usd: worstCase,
      cost_usd: worstCase,
    }).select('id').single()
    const settle = (row: Record<string, unknown>) =>
      reserved
        ? admin.from('ai_calls').update({ duration_ms: Date.now() - started, ...row }).eq('id', reserved.id)
          .then(({ error }) => { if (error) console.error('[ai] could not settle call', error.message) })
        : log(row)

    try {
      const message = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        ...(req.thinking === 'off' ? { thinking: { type: 'disabled' as const } } : {}),
        ...(req.effort || req.jsonSchema ? {
          output_config: {
            ...(req.effort ? { effort: req.effort } : {}),
            ...(req.jsonSchema ? { format: { type: 'json_schema', schema: req.jsonSchema } } : {}),
          },
        } : {}),
      } as Anthropic.MessageCreateParamsNonStreaming)
      const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, cacheReadTokens: message.usage.cache_read_input_tokens ?? 0 }
      const costUsd = costOf(AI_MODEL, usage)
      await settle({
        status: 'ok',
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_tokens: usage.cacheReadTokens,
        worst_case_usd: worstCase,
        cost_usd: costUsd,
      })
      return { ok: true, message, costUsd }
    } catch (e: any) {
      // A failed request is not billed; the reservation is released.
      await settle({ status: 'error', cost_usd: 0, error: String(e?.message ?? e).slice(0, 500) })
      return { ok: false, reason: 'error', detail: e?.message }
    }
  } catch (e: any) {
    await log({ status: 'error', error: String(e?.message ?? e).slice(0, 500) })
    return { ok: false, reason: 'error', detail: e?.message }
  }
}
