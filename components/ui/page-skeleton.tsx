// L2 · Instant feel.
//
// What a route shows the moment it is tapped, in the shape of the page that is
// coming: a header, then rows, cards or a form. A shape reads as "this is
// loading, here is what it will be", where a spinner in the middle of an empty
// screen reads as "nothing happened".
//
// These are server components on purpose — Next renders a route's loading.tsx
// before any client JavaScript has run, which is exactly when the screen would
// otherwise be blank.

import {
  SKELETON_BONE as BONE, SKELETON_BONE_LIGHT as BONE_LIGHT, SKELETON_SURFACE as SURFACE,
  SKELETON_BORDER as BORDER, SKELETON_GROUND as GROUND, SKELETON_HEADER,
  SKELETON_HEADER_BONE, SKELETON_HEADER_BONE_LIGHT,
} from '@/lib/design-tokens'

function Bar({ w, h = 12, light, radius = 5 }: { w: number | string; h?: number; light?: boolean; radius?: number }) {
  return <div style={{ width: w, height: h, borderRadius: radius, background: light ? BONE_LIGHT : BONE }} />
}

function Card({ children, pad = 16 }: { children?: React.ReactNode; pad?: number }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: pad }}>
      {children}
    </div>
  )
}

function Header({ title = 176 }: { title?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
      <Bar w={title} h={22} />
      <Bar w={232} h={12} light />
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: GROUND, padding: '24px 16px 96px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

// A list of records: inspections, vehicles, customers, leads.
export function ListSkeleton({ rows = 6, title }: { rows?: number; title?: number }) {
  return (
    <Shell>
      <Header title={title} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[84, 68, 92, 76].map((w, i) => <Bar key={i} w={w} h={30} radius={15} light={i > 0} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: rows }, (_, i) => (
          <Card key={i} pad={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Bar w={144} h={14} />
                <Bar w={112} h={11} light />
                <Bar w={80} h={11} light />
              </div>
              <Bar w={80} h={24} radius={12} light />
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  )
}

// Numbers across the top, then panels: dashboards and overviews.
export function DashboardSkeleton({ stats = 4, panels = 2 }: { stats?: number; panels?: number }) {
  return (
    <Shell>
      <Header />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: 12, marginBottom: 16 }}>
        {Array.from({ length: stats }, (_, i) => (
          <Card key={i} pad={14}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Bar w={72} h={10} light />
              <Bar w={56} h={22} />
            </div>
          </Card>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {Array.from({ length: panels }, (_, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Bar w={128} h={14} />
              {[1, 2, 3, 4].map(n => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Bar w={'60%'} h={11} light />
                  <Bar w={48} h={11} light />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  )
}

// One record with its photos: a vehicle, an inspection, a customer.
export function DetailSkeleton() {
  return (
    <Shell>
      <Header title={208} />
      <Card pad={0}>
        <div style={{ aspectRatio: '16 / 7', background: BONE_LIGHT, borderRadius: '12px 12px 0 0' }} />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Bar w={192} h={16} />
          <Bar w={144} h={11} light />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 6 }}>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Bar w={64} h={9} light />
                <Bar w={96} h={13} />
              </div>
            ))}
          </div>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <div key={n} style={{ aspectRatio: '4 / 3', background: BONE_LIGHT, borderRadius: 10, border: `1px solid ${BORDER}` }} />
        ))}
      </div>
    </Shell>
  )
}

// Settings and profile: labelled fields down the page.
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <Shell>
      <Header />
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Bar w={96} h={10} light />
              <Bar w={'100%'} h={38} radius={8} light />
            </div>
          ))}
          <Bar w={128} h={38} radius={8} />
        </div>
      </Card>
    </Shell>
  )
}

// A public page opened from a link: the inspector's form, an invoice, a report.
export function TokenPageSkeleton() {
  return (
    <div style={{ minHeight: '100vh', background: GROUND }}>
      <div style={{ background: SKELETON_HEADER, padding: '40px 16px 20px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ width: 160, height: 18, borderRadius: 5, background: SKELETON_HEADER_BONE }} />
          <div style={{ width: 232, height: 11, borderRadius: 5, background: SKELETON_HEADER_BONE_LIGHT }} />
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(n => (
          <Card key={n}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Bar w={144} h={14} />
              <Bar w={'100%'} h={11} light />
              <Bar w={'80%'} h={11} light />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
