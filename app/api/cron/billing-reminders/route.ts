import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date()
  const dayOfMonth = today.getDate()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
  const monthName = today.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Find companies whose billing day matches today and haven't been notified this month
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, billing_day_of_month, last_billing_reminder_at')
    .eq('billing_day_of_month', dayOfMonth)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!companies || companies.length === 0) return NextResponse.json({ notified: 0 })

  let notified = 0

  for (const company of companies) {
    // Guard: skip if already sent a reminder this calendar month
    if (company.last_billing_reminder_at && company.last_billing_reminder_at >= startOfMonth) {
      continue
    }

    // Count vehicles currently on lot as a proxy for "ready to bill"
    const { count: onLotCount } = await supabase
      .from('storage_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .not('arrived_at', 'is', null)
      .is('released_at', null)

    const count = onLotCount ?? 0

    await supabase.from('billing_notifications').insert({
      company_id: company.id,
      title: `Time to bill for ${monthName}`,
      message: count > 0
        ? `${count} vehicle${count !== 1 ? 's' : ''} on lot — review unbilled units and send invoices.`
        : 'Review your lot for vehicles ready to invoice.',
      unbilled_count: count,
    })

    await supabase
      .from('companies')
      .update({ last_billing_reminder_at: today.toISOString() })
      .eq('id', company.id)

    notified++
  }

  return NextResponse.json({ notified, day: dayOfMonth })
}
