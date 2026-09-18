// A · Checks the AI spend controls without spending anything.
//
//   npm run ai:test
//
// The budget rules are checked as plain arithmetic. The skip paths (kill
// switch, account switched off, no API key) are run for real against the
// database, and every row this writes to ai_calls is deleted afterwards.
// With ANTHROPIC_API_KEY unset no request ever leaves the machine.

import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0 && !line.startsWith('#')) process.env[line.slice(0, at).trim()] ??= line.slice(at + 1).trim().replace(/^"|"$/g, '')
}
const hadKey = !!process.env.ANTHROPIC_API_KEY
delete process.env.ANTHROPIC_API_KEY

const failures: string[] = []
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }

async function main() {
  const { costOf, worstCaseCost, fitsBudget } = await import('../lib/ai/pricing')
  const { runAi } = await import('../lib/ai/client')
  const { createAdminClient } = await import('../lib/supabase/admin')

  // ── Arithmetic ────────────────────────────────────────────────────────────
  check('cost of 10k in / 1k out on Sonnet 5 is $0.03', Math.abs(costOf('claude-sonnet-5', { inputTokens: 10_000, outputTokens: 1_000 }) - 0.03) < 1e-9)
  check('worst case counts every allowed output token', Math.abs(worstCaseCost('claude-sonnet-5', 1000, 2000) - (1000 * 2 + 2000 * 10) / 1e6) < 1e-9)
  const budget = { ceiling: 0.2, summaryReserve: 0.05, spent: 0.1 }
  check('a feature call that fits before the reserve is allowed', fitsBudget(budget, 0.05, false))
  check('a feature call that would eat the summary reserve is skipped', !fitsBudget(budget, 0.051, false))
  check('the summary may use the reserve', fitsBudget(budget, 0.1, true))
  check('the summary may not pass the ceiling', !fitsBudget(budget, 0.101, true))
  check('an exact fit is allowed', fitsBudget({ ceiling: 0.2, summaryReserve: 0, spent: 0.15 }, 0.05, false))

  // ── Skip paths, for real ──────────────────────────────────────────────────
  const admin = createAdminClient()
  const { data: company } = await admin.from('companies').select('id, ai_enabled').limit(1).single()
  const { data: settings } = await admin.from('ai_settings').select('kill_switch').single()
  const request = (feature: 'summary' | 'photo_check') => ({
    feature, promptVersion: runTag, companyId: company!.id, inspectionId: null,
    system: 'test', messages: [{ role: 'user' as const, content: 'test' }], maxTokens: 10,
  })
  // Rows are found by a tag unique to this run, not by time: the database's
  // clock and this machine's can differ by enough to miss a row.
  const runTag = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  try {
    const noKey = await runAi(request('summary'))
    check('with no API key the call is skipped, not thrown', !noKey.ok && noKey.reason === 'not_configured')

    await admin.from('ai_settings').update({ kill_switch: true }).eq('id', true)
    const killed = await runAi(request('summary'))
    check('the kill switch skips every call', !killed.ok && killed.reason === 'kill_switch')
    await admin.from('ai_settings').update({ kill_switch: settings!.kill_switch }).eq('id', true)

    await admin.from('companies').update({ ai_enabled: false }).eq('id', company!.id)
    const off = await runAi(request('photo_check'))
    check('an account with AI off is skipped', !off.ok && off.reason === 'account_off')
    await admin.from('companies').update({ ai_enabled: company!.ai_enabled }).eq('id', company!.id)

    const { data: logged } = await admin.from('ai_calls').select('status, cost_usd').eq('prompt_version', runTag)
    const statuses = (logged ?? []).map(r => r.status).sort().join(',')
    check('every skip is logged with its reason', statuses === 'skipped_account_off,skipped_kill_switch,skipped_not_configured')
    check('skipped calls cost nothing', (logged ?? []).every(r => Number(r.cost_usd) === 0))
  } finally {
    // Leave the live settings exactly as they were, and remove the test rows.
    await admin.from('ai_settings').update({ kill_switch: settings!.kill_switch }).eq('id', true)
    await admin.from('companies').update({ ai_enabled: company!.ai_enabled }).eq('id', company!.id)
    await admin.from('ai_calls').delete().eq('prompt_version', runTag)
  }

  console.log(hadKey ? '\n(an API key is configured; it was not used)' : '\n(no API key configured: live calls untested)')
  if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
  console.log('\nAll AI spend checks passed.')
}

main().catch(e => { console.error(e); process.exit(1) })
