'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { Check, Loader2, Eye, EyeOff } from 'lucide-react'

export default function ProfileSettingsPage() {
  const { user, userProfile, company, isOwnerUser, isCompanyOwner, refreshProfile, loading } = useAuth()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  const [companyName, setCompanyName] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)
  const [companySaved, setCompanySaved] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)

  const canEditCompany = isOwnerUser || isCompanyOwner

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (userProfile) setFullName(userProfile.full_name ?? '')
  }, [userProfile?.id])

  useEffect(() => {
    if (company) setCompanyName(company.name ?? '')
  }, [company?.id])

  const displayName = fullName || user?.email || ''
  const initials = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  const handleSaveProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    await createClient().from('user_profiles').update({ full_name: fullName }).eq('id', user.id)
    await refreshProfile()
    setSavingProfile(false)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2500)
  }

  const handleSaveCompany = async () => {
    if (!company?.id) return
    setSavingCompany(true)
    await createClient().from('companies').update({ name: companyName }).eq('id', company.id)
    await refreshProfile()
    setSavingCompany(false)
    setCompanySaved(true)
    setTimeout(() => setCompanySaved(false), 2500)
  }

  const handlePasswordChange = async () => {
    setPasswordError('')
    if (!currentPassword) { setPasswordError('Enter your current password.'); return }
    if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return }
    if (!user?.email) return

    setPasswordSaving(true)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
      if (authError) { setPasswordError('Current password is incorrect.'); return }
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) { setPasswordError(error.message); return }
      setPasswordSaved(true)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setTimeout(() => setPasswordSaved(false), 3000)
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading || !user) return null

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10,
    padding: '0 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    background: '#FAFAFA', boxSizing: 'border-box',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px',
  }

  const card: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #E1E8F0',
    borderRadius: 16, padding: 20, marginBottom: 16,
  }

  const saveBtn = (saved: boolean, saving: boolean): React.CSSProperties => ({
    height: 42, padding: '0 20px', borderRadius: 10, border: 'none',
    background: saved ? '#10B981' : '#0D1B2A', color: '#FFF',
    fontSize: 14, fontWeight: 700,
    cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
    opacity: saving ? 0.7 : 1, transition: 'background 300ms ease',
    display: 'flex', alignItems: 'center', gap: 6,
  })

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{
        padding: isDesktop ? '28px 32px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 640, margin: '0 auto',
      }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: isDesktop ? 22 : 20, fontWeight: 800, color: '#0D1B2A', margin: '0 0 4px' }}>Profile</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Manage your personal details and password</p>
        </div>

        {/* Avatar card */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28, flexShrink: 0,
            background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: '#FFFFFF',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userProfile?.full_name || '—'}
            </p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </p>
          </div>
        </div>

        {/* Personal info */}
        <div style={card}>
          <p style={sectionLabel}>Personal Info</p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={user.email ?? ''} disabled
              style={{ ...inputStyle, background: '#F0F4F8', color: '#94A3B8', cursor: 'not-allowed' }}
            />
            <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>Email changes require contacting support.</p>
          </div>

          <button onClick={handleSaveProfile} disabled={savingProfile} style={saveBtn(profileSaved, savingProfile)}>
            {profileSaved
              ? <><Check size={15} />Saved</>
              : savingProfile
              ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />Saving…</>
              : 'Save Changes'}
          </button>
        </div>

        {/* Organization */}
        {company && (
          <div style={card}>
            <p style={sectionLabel}>Organization</p>

            <div style={{ marginBottom: canEditCompany ? 16 : 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={e => canEditCompany && setCompanyName(e.target.value)}
                disabled={!canEditCompany}
                style={{
                  ...inputStyle,
                  background: canEditCompany ? '#FAFAFA' : '#F0F4F8',
                  color: canEditCompany ? '#0D1B2A' : '#6B7280',
                  cursor: canEditCompany ? 'text' : 'not-allowed',
                }}
              />
              {!canEditCompany && (
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>Only the account owner can change the company name.</p>
              )}
            </div>

            {canEditCompany && (
              <button onClick={handleSaveCompany} disabled={savingCompany} style={saveBtn(companySaved, savingCompany)}>
                {companySaved
                  ? <><Check size={15} />Saved</>
                  : savingCompany
                  ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />Saving…</>
                  : 'Save Company'}
              </button>
            )}
          </div>
        )}

        {/* Change password */}
        <div style={card}>
          <p style={sectionLabel}>Change Password</p>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Current Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                style={{ ...inputStyle, paddingRight: 42 }}
              />
              <button onClick={() => setShowCurrentPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8', display: 'flex' }}>
                {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ ...inputStyle, paddingRight: 42 }}
              />
              <button onClick={() => setShowNewPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8', display: 'flex' }}>
                {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Confirm New Password</label>
            <input
              type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password" style={inputStyle}
            />
          </div>

          {passwordError && (
            <p style={{ fontSize: 13, color: '#EF4444', margin: '0 0 12px' }}>{passwordError}</p>
          )}

          <button
            onClick={handlePasswordChange}
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
            style={{
              ...saveBtn(passwordSaved, passwordSaving),
              background: passwordSaved
                ? '#10B981'
                : (!currentPassword || !newPassword || !confirmPassword || passwordSaving)
                ? '#E1E8F0'
                : '#0D1B2A',
              color: (!currentPassword || !newPassword || !confirmPassword) && !passwordSaved ? '#94A3B8' : '#FFF',
              cursor: (!currentPassword || !newPassword || !confirmPassword || passwordSaving) ? 'default' : 'pointer',
            }}
          >
            {passwordSaved
              ? <><Check size={15} />Password Updated</>
              : passwordSaving
              ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />Updating…</>
              : 'Update Password'}
          </button>
        </div>

        <BottomNav />
      </div>
    </>
  )
}
