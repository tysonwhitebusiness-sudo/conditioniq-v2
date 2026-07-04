'use client'

import {
  Document, Page, View, Text, Image, StyleSheet,
} from '@react-pdf/renderer'

const C = {
  midnight: '#0D1B2A', cyan: '#00B4D8',
  gray100: '#F0F4F8', gray200: '#E1E8F0', gray400: '#94A3B8', gray600: '#4A5568',
  white: '#FFFFFF', green: '#10B981',
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: C.white, padding: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 },
  companyName: { fontSize: 18, fontWeight: 'bold', color: C.midnight },
  invoiceLabel: { fontSize: 28, fontWeight: 'bold', color: C.midnight, textAlign: 'right' },
  invoiceNumber: { fontSize: 13, color: C.cyan, textAlign: 'right', marginTop: 4 },
  invoiceDate: { fontSize: 11, color: C.gray400, textAlign: 'right', marginTop: 2 },
  divider: { height: 1, backgroundColor: C.gray200, marginBottom: 28 },
  twoCol: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  colLabel: { fontSize: 9, fontWeight: 'bold', color: C.gray400, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  colValue: { fontSize: 12, color: C.midnight, fontWeight: 'bold' },
  colSub: { fontSize: 11, color: C.gray600, marginTop: 3 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.midnight, borderRadius: 4, padding: '8 12', marginBottom: 0 },
  tableHeaderText: { fontSize: 10, fontWeight: 'bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', padding: '10 12', borderBottomWidth: 1, borderBottomColor: C.gray100 },
  tableCell: { fontSize: 12, color: C.midnight },
  tableCellRight: { fontSize: 12, color: C.midnight, textAlign: 'right' },
  totalBox: { backgroundColor: C.midnight, borderRadius: 8, padding: '14 18', marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, fontWeight: 'bold', color: C.white },
  totalAmount: { fontSize: 20, fontWeight: 'bold', color: C.cyan },
  notes: { marginTop: 24 },
  notesLabel: { fontSize: 9, fontWeight: 'bold', color: C.gray400, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  notesText: { fontSize: 11, color: C.gray600, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 10 },
  footerText: { fontSize: 9, color: C.gray400, textAlign: 'center' },
})

export interface InvoiceChargeLine {
  id: string
  label: string
  amount: number
}

export interface InvoicePDFData {
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string
  companyName: string
  logoUrl?: string | null
  brandHeaderColor?: string | null
  brandAccentColor?: string | null
  billToName?: string
  billToContact?: string
  vehicleYear?: string | null
  vehicleMake?: string | null
  vehicleModel?: string | null
  vehicleVin?: string | null
  intakeDate?: string | null
  includeStorage: boolean
  daysOnLot: number
  billingType: 'daily' | 'monthly'
  rate: number
  storageAmount: number
  charges: InvoiceChargeLine[]
  totalAmount: number
  notes?: string
}

export default function InvoicePDF({ data }: { data: InvoicePDFData }) {
  const vehicleTitle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ') || 'Vehicle'
  const rateLabel = data.billingType === 'daily' ? `${data.daysOnLot} days × $${data.rate.toFixed(2)}/day` : `${data.daysOnLot} days (${(data.daysOnLot / 30).toFixed(2)} mo) × $${data.rate.toFixed(2)}/mo`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {data.logoUrl ? (
              <>
                <Image src={data.logoUrl} style={{ height: 36, maxWidth: 140, objectFit: 'contain', marginBottom: data.companyName ? 6 : 0 }} />
                {data.companyName && <Text style={[styles.companyName, { fontSize: 13 }]}>{data.companyName}</Text>}
              </>
            ) : (
              <Text style={styles.companyName}>{data.companyName}</Text>
            )}
          </View>
          <View>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>{data.invoiceDate}</Text>
            {data.dueDate && <Text style={[styles.invoiceDate, { marginTop: 2 }]}>Due: {data.dueDate}</Text>}
          </View>
        </View>

        <View style={{ height: 3, backgroundColor: data.brandAccentColor ?? '#F4A62A', marginBottom: 4 }} />
        <View style={styles.divider} />

        {/* Bill To + Vehicle Info */}
        <View style={styles.twoCol}>
          <View>
            <Text style={styles.colLabel}>Bill To</Text>
            <Text style={styles.colValue}>{data.billToName || '—'}</Text>
            {data.billToContact && <Text style={styles.colSub}>{data.billToContact}</Text>}
          </View>
          <View>
            <Text style={styles.colLabel}>Vehicle</Text>
            <Text style={styles.colValue}>{vehicleTitle}</Text>
            {data.vehicleVin && <Text style={styles.colSub}>VIN: {data.vehicleVin}</Text>}
            {data.intakeDate && <Text style={styles.colSub}>In: {data.intakeDate}</Text>}
          </View>
        </View>

        {/* Line Items */}
        <View style={[styles.tableHeader, data.brandHeaderColor ? { backgroundColor: data.brandHeaderColor } : {}]}>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Description</Text>
          <Text style={[styles.tableHeaderText, { width: 100, textAlign: 'right' }]}>Amount</Text>
        </View>
        {data.includeStorage && (
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 1 }]}>
              {data.billingType === 'daily' ? 'Daily Storage' : 'Monthly Storage'} — {vehicleTitle}
              {'\n'}
              <Text style={{ fontSize: 10, color: C.gray400 }}>{rateLabel}</Text>
            </Text>
            <Text style={[styles.tableCellRight, { width: 100 }]}>${data.storageAmount.toFixed(2)}</Text>
          </View>
        )}

        {data.charges.map(c => (
          <View key={c.id} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 1 }]}>{c.label}</Text>
            <Text style={[styles.tableCellRight, { width: 100 }]}>${c.amount.toFixed(2)}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total Due</Text>
          <Text style={styles.totalAmount}>${data.totalAmount.toFixed(2)}</Text>
        </View>

        {/* Notes */}
        {data.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated by Condition IQ · {data.invoiceNumber}</Text>
        </View>
      </Page>
    </Document>
  )
}
