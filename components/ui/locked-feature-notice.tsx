'use client'

import { Lock } from 'lucide-react'

export default function LockedFeatureNotice({ featureName, description }: { featureName: string; description?: string }) {
  const mailtoHref = `mailto:support@conditioniq.com?subject=${encodeURIComponent(`Enable ${featureName}`)}&body=${encodeURIComponent(`Hi CIQ team,\n\nI'd like to enable ${featureName} for my account.\n\nThanks`)}`
  return (
    <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 64, height: 64, borderRadius: 32, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Lock size={28} color="#94A3B8" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px', textAlign: 'center' }}>
        {featureName} is not enabled for your account.
      </h2>
      {description && (
        <p style={{ fontSize: 14, color: '#4A5568', margin: '0 0 16px', textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      <a
        href={mailtoHref}
        style={{ height: 44, padding: '0 22px', borderRadius: 10, background: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', marginTop: description ? 0 : 8 }}
      >
        Contact us to enable
      </a>
    </div>
  )
}
