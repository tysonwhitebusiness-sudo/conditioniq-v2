import Link from 'next/link'
import { GRAY_900, GRAY_700, GRAY_500, GRAY_300, WHITE, WARN_LIGHT, WARN_DARK, PRIMARY } from '@/lib/design-tokens'

// A · Shared frame for the terms and privacy pages.
//
// Both are drafts written for a lawyer's review. The notice at the top stays
// until that review is done; remove DRAFT below to take it down.

export const LEGAL_ENTITY = 'ConditionIQ LLC'
export const LEGAL_CONTACT = 'jeff@conditioniq.app'
export const LEGAL_UPDATED = 'September 18, 2026'
const DRAFT = true

export interface LegalSection { heading: string; body: string[] }

export default function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <main style={{ minHeight: '100vh', background: WHITE, padding: '40px 16px 64px' }}>
      <article style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href="/" style={{ fontSize: 13, fontWeight: 800, color: GRAY_900, textDecoration: 'none' }}>Condition IQ</Link>
        {DRAFT ? (
          <p style={{ background: WARN_LIGHT, color: WARN_DARK, fontSize: 13, borderRadius: 8, padding: '10px 12px', margin: '20px 0 0', lineHeight: 1.5 }}>
            Draft pending legal review. Questions: {LEGAL_CONTACT}.
          </p>
        ) : null}
        <h1 style={{ fontSize: 28, fontWeight: 800, color: GRAY_900, margin: '20px 0 4px' }}>{title}</h1>
        <p style={{ fontSize: 13, color: GRAY_500, margin: '0 0 20px' }}>{`${LEGAL_ENTITY} · Last updated ${LEGAL_UPDATED}`}</p>
        <p style={{ fontSize: 15, color: GRAY_700, lineHeight: 1.65, margin: '0 0 8px' }}>{intro}</p>
        {sections.map((s, i) => (
          <section key={s.heading} style={{ borderTop: `1px solid ${GRAY_300}`, marginTop: 24, paddingTop: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: GRAY_900, margin: '0 0 8px' }}>{`${i + 1}. ${s.heading}`}</h2>
            {s.body.map((p, j) => <p key={j} style={{ fontSize: 15, color: GRAY_700, lineHeight: 1.65, margin: '0 0 10px' }}>{p}</p>)}
          </section>
        ))}
        <p style={{ fontSize: 13, color: GRAY_500, marginTop: 32 }}>
          {`Contact: ${LEGAL_ENTITY}, Missouri, United States · `}
          <a href={`mailto:${LEGAL_CONTACT}`} style={{ color: PRIMARY }}>{LEGAL_CONTACT}</a>
        </p>
      </article>
    </main>
  )
}
