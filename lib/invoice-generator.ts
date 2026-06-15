import type { InvoicePDFData } from './invoice-pdf'
import type { LotInvoice } from './invoice-actions'

export async function generateAndSaveInvoice(
  data: InvoicePDFData & {
    companyId: string
    vehicleId: string
    invoiceNumber: string
    userId: string
    vehicleVin?: string | null
    vehicleDescription?: string | null
    daysOnLot: number
    billingType: 'daily' | 'monthly'
    rate: number
    accruedAmount: number
    billToName?: string
    billToContact?: string
    notes?: string
    dueDate?: string
  }
): Promise<{ invoice: LotInvoice | null; opened: boolean }> {
  const React = (await import('react')).default
  const { pdf } = await import('@react-pdf/renderer')
  const { default: InvoicePDF } = await import('./invoice-pdf')
  const { createInvoiceUploadUrl, saveLotInvoice, getInvoiceSignedUrl } = await import('./invoice-actions')
  const { createClient } = await import('./supabase/client')

  // Fetch logo for white label
  let logoUrl: string | null = null
  try {
    const { getCompanyLogo } = await import('./branding-actions')
    const branding = await getCompanyLogo(data.companyId)
    logoUrl = branding.logoUrl
  } catch { /* non-fatal */ }

  const element = React.createElement(InvoicePDF, { data: { ...data, logoUrl } }) as any
  const blob = await pdf(element).toBlob()

  const uploadAuth = await createInvoiceUploadUrl(data.companyId, data.invoiceNumber)

  let storagePath: string | null = null
  if (uploadAuth) {
    const supabase = createClient()
    const { error } = await supabase.storage
      .from('invoices')
      .uploadToSignedUrl(uploadAuth.path, uploadAuth.token, blob, { contentType: 'application/pdf' })
    if (!error) {
      storagePath = uploadAuth.path
      const viewUrl = await getInvoiceSignedUrl(storagePath)
      if (viewUrl) window.open(viewUrl, '_blank')
    } else {
      console.error('[invoice-generator] upload error', error)
    }
  }

  if (!storagePath) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.invoiceNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const invoice = await saveLotInvoice({
    company_id: data.companyId,
    vehicle_id: data.vehicleId,
    invoice_number: data.invoiceNumber,
    invoice_date: data.invoiceDate,
    due_date: data.dueDate ?? null,
    bill_to_name: data.billToName ?? null,
    bill_to_contact: data.billToContact ?? null,
    vehicle_vin: data.vehicleVin ?? null,
    vehicle_description: data.vehicleDescription ?? null,
    days_on_lot: data.daysOnLot,
    billing_type: data.billingType,
    rate: data.rate,
    total_amount: data.accruedAmount,
    storage_path: storagePath,
    notes: data.notes ?? null,
    status: 'draft',
    created_by: data.userId,
    bulk_invoice_id: null,
  })

  return { invoice, opened: !!storagePath }
}
