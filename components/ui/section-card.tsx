export default function SectionCard({ title, count, action, elevated, children }: {
  title: string
  count?: number
  action?: React.ReactNode
  elevated?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 16,
      border: elevated ? '1.5px solid #00B4D8' : '1px solid #D1D5DB',
      boxShadow: elevated ? '0 4px 20px rgba(0, 180, 216, 0.14)' : 'none',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          {title}
          {count != null && <span style={{ color: '#00B4D8', fontWeight: 800 }}>{count}</span>}
        </h2>
        {action}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}
