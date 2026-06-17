import Link from 'next/link'
import changelog from '@/content/changelog.json'

const TAG_CFG: Record<string, { bg: string; color: string }> = {
  New:      { bg: '#E0F7FC', color: '#0097B2' },
  Improved: { bg: '#E8F5E9', color: '#2E7D32' },
  Fix:      { bg: '#FEE2E2', color: '#991B1B' },
}

export const metadata = {
  title: "What's New — Condition IQ",
  description: 'Latest updates and improvements to the Condition IQ platform.',
}

export default function ChangelogPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', color: '#F0F4F8', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.07)', maxWidth: 800, margin: '0 auto' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#0D1B2A' }}>C</div>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#F0F4F8' }}>Condition IQ</span>
        </Link>
        <Link href="/login" style={{ fontSize: 14, color: '#00B4D8', textDecoration: 'none', fontWeight: 500 }}>Sign In →</Link>
      </nav>

      {/* Header */}
      <header style={{ maxWidth: 800, margin: '0 auto', padding: '56px 32px 40px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00B4D8', margin: '0 0 10px' }}>Changelog</p>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#F0F4F8', margin: '0 0 12px', lineHeight: 1.2 }}>What's New</h1>
        <p style={{ fontSize: 16, color: 'rgba(240,244,248,0.5)', margin: 0 }}>Updates and improvements, most recent first.</p>
      </header>

      {/* Entries */}
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '0 32px 80px' }}>
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.08)' }} />

          {(changelog as Array<{ date: string; version: string; title: string; description: string; tag: string }>).map((entry, i) => {
            const tag = TAG_CFG[entry.tag] ?? TAG_CFG.New
            const dateObj = new Date(entry.date)
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

            return (
              <div key={i} style={{ display: 'flex', gap: 28, paddingBottom: 40 }}>
                {/* Dot */}
                <div style={{ flexShrink: 0, position: 'relative' }}>
                  <div style={{ width: 12, height: 12, borderRadius: 6, background: '#00B4D8', border: '2px solid #0D1B2A', marginTop: 6 }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingLeft: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(240,244,248,0.4)', fontWeight: 500 }}>{dateStr}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: tag.bg, color: tag.color, letterSpacing: '0.05em' }}>{entry.tag.toUpperCase()}</span>
                    <span style={{ fontSize: 12, color: 'rgba(240,244,248,0.3)', fontWeight: 500 }}>{entry.version}</span>
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F0F4F8', margin: '0 0 8px', lineHeight: 1.3 }}>{entry.title}</h2>
                  <p style={{ fontSize: 14, color: 'rgba(240,244,248,0.6)', margin: 0, lineHeight: 1.75 }}>{entry.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <footer style={{ textAlign: 'center', padding: '0 0 32px', fontSize: 13, color: 'rgba(240,244,248,0.25)' }}>
        © 2025 Condition IQ
      </footer>
    </div>
  )
}
