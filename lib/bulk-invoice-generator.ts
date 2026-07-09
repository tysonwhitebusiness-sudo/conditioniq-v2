import type { BulkInvoicePDFData, BulkInvoicePDFRow } from './bulk-invoice-pdf'
import { logVehicleEvent } from './vehicle-events-actions'

export interface BulkGeneratorRow extends BulkInvoicePDFRow {
  vehicleId: string | null
}

export async function generateAndSaveBulkInvoice(params: {
  companyId: string
  companyName: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string | null
  billToName: string
  billToContact?: string | null
  notes?: string | null
  userId: string | null
  rows: BulkGeneratorRow[]
  totalAmount: number
  bulkInvoiceId?: string   // pre-generated UUID (if retrying)
  customerId?: string | null
}): Promise<{
  bulkInvoiceId: string | null
  groupId: string | null
  invoiceNumber: string
  pdfBlob: Blob
  storagePath: string | null
  signedUrl: string | null
  error: string | null
}> {
  const React = (await import('react')).default
  const { pdf } = await import('@react-pdf/renderer')
  const { default: BulkInvoicePDF } = await import('./bulk-invoice-pdf')
  const { createBulkInvoiceUploadUrl, saveBulkInvoice, getBulkInvoiceSignedUrl } = await import('./bulk-invoice-actions')
  const { createClient } = await import('./supabase/client')

  // Pick a stable ID for this batch
  const batchId = params.bulkInvoiceId ?? crypto.randomUUID()

  // Fetch logo + brand colors for white label
  let logoUrl: string | null = null
  let brandHeaderColor: string | null = null
  let brandAccentColor: string | null = null
  try {
    const { getCompanyLogo } = await import('./branding-actions')
    const branding = await getCompanyLogo(params.companyId)
    logoUrl = branding.logoUrl
    brandHeaderColor = branding.brandHeaderColor
    brandAccentColor = branding.brandAccentColor
  } catch { /* non-fatal */ }

  const pdfData: BulkInvoicePDFData = {
    invoiceNumber: params.invoiceNumber,
    invoiceDate: params.invoiceDate,
    dueDate: params.dueDate,
    companyName: params.companyName,
    logoUrl,
    brandHeaderColor,
    brandAccentColor,
    billToName: params.billToName,
    billToContact: params.billToContact,
    notes: params.notes,
    bulkInvoiceId: batchId,
    rows: params.rows,
    totalAmount: params.totalAmount,
  }

  const element = React.createElement(BulkInvoicePDF, { data: pdfData }) as any
  const pdfBlob = await pdf(element).toBlob()

  // Upload to storage
  const uploadAuth = await createBulkInvoiceUploadUrl(params.companyId, params.invoiceNumber)
  let storagePath: string | null = null
  let signedUrl: string | null = null

  if (uploadAuth) {
    const supabase = createClient()
    const { error: upErr } = await supabase.storage
      .from('invoices')
      .uploadToSignedUrl(uploadAuth.path, uploadAuth.token, pdfBlob, { contentType: 'application/pdf' })
    if (!upErr) {
      storagePath = uploadAuth.path
      signedUrl = await getBulkInvoiceSignedUrl(storagePath)
    } else {
      console.error('[bulk-invoice-generator] upload error', upErr)
    }
  }

  // Save DB rows (one per vehicle, all sharing bulkInvoiceId + invoiceNumber)
  const { bulkInvoiceId, groupId, error } = await saveBulkInvoice({
    companyId: params.companyId,
    invoiceNumber: params.invoiceNumber,
    invoiceDate: params.invoiceDate,
    dueDate: params.dueDate,
    billToName: params.billToName,
    billToContact: params.billToContact,
    notes: params.notes,
    storagePath,
    rows: params.rows.map(r => ({
      vehicleId: r.vehicleId,
      vin: r.vin,
      vehicleDescription: r.vehicleDescription,
      effectiveStart: r.effectiveStart,
      effectiveEnd: r.effectiveEnd,
      days: r.days,
      billingType: r.billingType,
      rate: r.rate,
      subtotal: r.subtotal,
    })),
    createdBy: params.userId,
    customerId: params.customerId,
  })

  if (error) return { bulkInvoiceId: null, groupId: null, invoiceNumber: params.invoiceNumber, pdfBlob, storagePath, signedUrl, error }

  for (const row of params.rows) {
    if (!row.vehicleId) continue
    logVehicleEvent({
      companyId: params.companyId, vehicleId: row.vehicleId, eventType: 'invoice_generated',
      description: `Invoice ${params.invoiceNumber} generated (bulk)`,
      metadata: { bulk_invoice_id: bulkInvoiceId, group_id: groupId, amount: row.subtotal },
      createdBy: params.userId,
    })
  }

  return { bulkInvoiceId, groupId: groupId ?? null, invoiceNumber: params.invoiceNumber, pdfBlob, storagePath, signedUrl, error: null }
}
