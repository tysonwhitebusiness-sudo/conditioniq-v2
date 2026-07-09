import type { InvoicePDFData } from './invoice-pdf'
import type { LotInvoice } from './invoice-actions'
import { captureHighSeverityError } from './sentry'
import { logVehicleEvent } from './vehicle-events-actions'

export async function generateAndSaveInvoice(
  data: InvoicePDFData & {
    companyId: string
    vehicleId: string
    invoiceNumber: string
    userId: string
    vehicleVin?: string | null
    vehicleDescription?: string | null
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

  // Fetch logo + brand colors for white label
  let logoUrl: string | null = null
  let brandHeaderColor: string | null = null
  let brandAccentColor: string | null = null
  try {
    const { getCompanyLogo } = await import('./branding-actions')
    const branding = await getCompanyLogo(data.companyId)
    logoUrl = branding.logoUrl
    brandHeaderColor = branding.brandHeaderColor
    brandAccentColor = branding.brandAccentColor
  } catch { /* non-fatal */ }

  const element = React.createElement(InvoicePDF, { data: { ...data, logoUrl, brandHeaderColor, brandAccentColor } }) as any
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
      captureHighSeverityError(error, { flow: 'invoice-upload', invoiceNumber: data.invoiceNumber, companyId: data.companyId })
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

  let invoice: LotInvoice | null = null
  try {
    invoice = await saveLotInvoice({
      company_id: data.companyId,
      vehicle_id: data.vehicleId,
      invoice_number: data.invoiceNumber,
      invoice_date: data.invoiceDate,
      due_date: data.dueDate ?? null,
      bill_to_name: data.billToName ?? null,
      bill_to_contact: data.billToContact ?? null,
      vehicle_vin: data.vehicleVin ?? null,
      vehicle_description: data.vehicleDescription ?? null,
      days_on_lot: data.includeStorage ? data.daysOnLot : 0,
      billing_type: data.billingType,
      rate: data.rate,
      total_amount: data.totalAmount,
      storage_period_start: data.includeStorage ? data.storagePeriodStart ?? null : null,
      storage_period_end: data.includeStorage ? data.storagePeriodEnd ?? null : null,
      storage_path: storagePath,
      notes: data.notes ?? null,
      status: 'draft',
      created_by: data.userId,
      bulk_invoice_id: null,
    })

    if (invoice?.group_id && data.charges.length > 0) {
      const { linkChargesToInvoice } = await import('./invoice-charge-actions')
      await linkChargesToInvoice(invoice.group_id, data.companyId, data.charges.map(c => ({ id: c.id, amount: c.amount })))
    }

    if (invoice && data.includeStorage && data.storagePeriodEnd) {
      const { advanceBilledThroughDate } = await import('./invoice-charge-actions')
      await advanceBilledThroughDate(data.vehicleId, data.storagePeriodEnd)
    }

    if (invoice) {
      logVehicleEvent({
        companyId: data.companyId, vehicleId: data.vehicleId, eventType: 'invoice_generated',
        description: `Invoice ${data.invoiceNumber} generated`,
        metadata: { invoice_id: invoice.id, amount: data.totalAmount },
        createdBy: data.userId,
      })
    }
  } catch (err) {
    captureHighSeverityError(err, { flow: 'saveLotInvoice', invoiceNumber: data.invoiceNumber, companyId: data.companyId })
    throw err
  }

  return { invoice, opened: !!storagePath }
}
