import { NextResponse } from 'next/server'
import { authorizeInspectionAccess } from '@/lib/inspection-auth'
import { generateAndStoreReport } from '@/lib/report/render'

// R1 · Report foundation.
//
// One place that produces a report. The browser asks for an inspection's report
// and gets back a link; the rendering, the photos and the fonts all stay here,
// so every device gets an identical file.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let inspectionId: string | undefined
  try {
    const body = await request.json()
    inspectionId = typeof body?.inspectionId === 'string' ? body.inspectionId : undefined
  } catch {
    return NextResponse.json({ error: 'Expected { inspectionId }' }, { status: 400 })
  }
  if (!inspectionId) return NextResponse.json({ error: 'Expected { inspectionId }' }, { status: 400 })

  const { ok } = await authorizeInspectionAccess(inspectionId)
  if (!ok) return NextResponse.json({ error: 'Not authorized for this inspection' }, { status: 403 })

  try {
    const result = await generateAndStoreReport(inspectionId)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[report] generation failed', e)
    return NextResponse.json({ error: e?.message ?? 'Report generation failed' }, { status: 500 })
  }
}
