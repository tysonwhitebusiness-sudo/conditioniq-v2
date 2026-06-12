'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F0F4F8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo / branding */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: '#0D1B2A', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4" />
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0D1B2A', margin: '0 0 6px' }}>Condition IQ</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Sign in to your account</p>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF', borderRadius: 20,
          boxShadow: '0 4px 24px rgba(13,27,42,0.08)',
          border: '1px solid #E1E8F0', padding: 28,
        }}>
          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                style={{
                  width: '100%', height: 46, border: '1.5px solid #E1E8F0',
                  borderRadius: 12, padding: '0 14px', fontSize: 14,
                  outline: 'none', fontFamily: 'inherit', background: '#FAFAFA',
                  color: '#0D1B2A', boxSizing: 'border-box',
                  transition: 'border-color 150ms',
                }}
                onFocus={e => (e.target.style.borderColor = '#00B4D8')}
                onBlur={e => (e.target.style.borderColor = '#E1E8F0')}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Password</label>
                <Link href="/reset-password" style={{ fontSize: 12, color: '#00B4D8', textDecoration: 'none', fontWeight: 500 }}>
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  width: '100%', height: 46, border: '1.5px solid #E1E8F0',
                  borderRadius: 12, padding: '0 14px', fontSize: 14,
                  outline: 'none', fontFamily: 'inherit', background: '#FAFAFA',
                  color: '#0D1B2A', boxSizing: 'border-box',
                  transition: 'border-color 150ms',
                }}
                onFocus={e => (e.target.style.borderColor = '#00B4D8')}
                onBlur={e => (e.target.style.borderColor = '#E1E8F0')}
              />
            </div>

            {error && (
              <div style={{
                background: '#FEE2E2', border: '1px solid #FECACA',
                borderRadius: 10, padding: '10px 14px', marginBottom: 18,
              }}>
                <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', height: 48, borderRadius: 12, border: 'none',
                background: loading ? '#94A3B8' : '#0D1B2A',
                color: '#FFFFFF', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'default' : 'pointer',
                fontFamily: 'inherit', transition: 'background 150ms',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#CBD5E1', marginTop: 20 }}>
          © {new Date().getFullYear()} Condition IQ
        </p>
      </div>
    </div>
  )
}
