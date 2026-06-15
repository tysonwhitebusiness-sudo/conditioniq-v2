'use client'

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const C = {
  midnight: '#0D1B2A', cyan: '#00B4D8',
  gray100: '#F0F4F8', gray200: '#E1E8F0', gray400: '#94A3B8', gray600: '#4A5568',
  white: '#FFFFFF',
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
  tableHeader: { flexDirection: 'row', backgroundColor: C.midnight, borderRadius: 4, padding: '7 10', marginBottom: 0 },
  tableHeaderText: { fontSize: 8, fontWeight: 'bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.4 },
  tableRowEven: { flexDirection: 'row', padding: '7 10', backgroundColor: C.gray100 },
  tableRowOdd:  { flexDirection: 'row', padding: '7 10', backgroundColor: C.white },
  cell: { fontSize: 9, color: C.midnight },
  cellRight: { fontSize: 9, color: C.midnight, textAlign: 'right' },
  cellMono: { fontSize: 8, color: C.gray600, fontFamily: 'Courier' },
  totalBox: { backgroundColor: C.midnight, borderRadius: 8, padding: '14 18', marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, fontWeight: 'bold', color: C.white },
  totalAmount: { fontSize: 20, fontWeight: 'bold', color: C.cyan },
  notes: { marginTop: 24 },
  notesLabel: { fontSize: 9, fontWeight: 'bold', color: C.gray400, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  notesText: { fontSize: 11, color: C.gray600, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 10 },
  footerText: { fontSize: 9, color: C.gray400, textAlign: 'center' },
})

export interface BulkInvoicePDFRow {
  vehicleId: string | null
  vin: string
  vehicleDescription: string | null
  effectiveStart: string
  effectiveEnd: string
  days: number
  rate: number
  billingType: 'daily' | 'monthly'
  subtotal: number
}

export interface BulkInvoicePDFData {
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string | null
  companyName: string
  logoUrl?: string | null
  billToName?: string
  billToContact?: string | null
  notes?: string | null
  bulkInvoiceId: string
  rows: BulkInvoicePDFRow[]
  totalAmount: number
}

export default function BulkInvoicePDF({ data }: { data: BulkInvoicePDFData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {data.logoUrl
              ? <Image src={data.logoUrl} style={{ height: 40, maxWidth: 160, objectFit: 'contain' }} />
              : <Text style={styles.companyName}>{data.companyName}</Text>}
          </View>
          <View>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>{data.invoiceDate}</Text>
            {data.dueDate && <Text style={[styles.invoiceDate, { marginTop: 2 }]}>Due: {data.dueDate}</Text>}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bill To + Summary */}
        <View style={styles.twoCol}>
          <View>
            <Text style={styles.colLabel}>Bill To</Text>
            <Text style={styles.colValue}>{data.billToName || '—'}</Text>
            {data.billToContact && <Text style={styles.colSub}>{data.billToContact}</Text>}
          </View>
          <View>
            <Text style={styles.colLabel}>Summary</Text>
            <Text style={styles.colValue}>{data.rows.length} vehicle{data.rows.length !== 1 ? 's' : ''}</Text>
            <Text style={styles.colSub}>Bulk storage invoice</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { width: 20 }]}>#</Text>
          <Text style={[styles.tableHeaderText, { width: 80 }]}>VIN</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Vehicle</Text>
          <Text style={[styles.tableHeaderText, { width: 120 }]}>Billing Period</Text>
          <Text style={[styles.tableHeaderText, { width: 28, textAlign: 'right' }]}>Days</Text>
          <Text style={[styles.tableHeaderText, { width: 55, textAlign: 'right' }]}>Rate</Text>
          <Text style={[styles.tableHeaderText, { width: 65, textAlign: 'right' }]}>Subtotal</Text>
        </View>

        {data.rows.map((r, i) => {
          const rowStyle = i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd
          const rateLabel = r.billingType === 'daily' ? `$${r.rate.toFixed(2)}/day` : `$${r.rate.toFixed(2)}/mo`
          const desc = r.vehicleDescription ?? r.vin
          return (
            <View key={`${r.vin}-${i}`} style={rowStyle}>
              <Text style={[styles.cell, { width: 20 }]}>{i + 1}</Text>
              <Text style={[styles.cellMono, { width: 80 }]}>{r.vin}</Text>
              <Text style={[styles.cell, { flex: 1 }]}>{desc}</Text>
              <Text style={[styles.cell, { width: 120 }]}>{r.effectiveStart} → {r.effectiveEnd}</Text>
              <Text style={[styles.cellRight, { width: 28 }]}>{r.days}</Text>
              <Text style={[styles.cellRight, { width: 55 }]}>{rateLabel}</Text>
              <Text style={[styles.cellRight, { width: 65 }]}>${r.subtotal.toFixed(2)}</Text>
            </View>
          )
        })}

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
          <Text style={styles.footerText}>
            Generated by Condition IQ · {data.invoiceNumber} · Report ID: {data.bulkInvoiceId}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
