'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, LogOut } from 'lucide-react'
import Link from 'next/link'

export default function ProfilePage() {
  const { user, userProfile, company, loading, signOut, refreshProfile } = useAuth()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ full_name: '', employee_id: '', default_location: '' })

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (userProfile) setForm({ full_name: userProfile.full_name ?? '', employee_id: userProfile.employee_id ?? '', default_location: userProfile.default_location ?? '' })
  }, [user, loading, userProfile, router])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('user_profiles').update(form).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
  }

  const handleSignOut = async () => {
    await signOut()
    router.replace('/')
  }

  if (loading || !user) return null

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6 pt-2">
        <Link href="/" className="p-2 -ml-2 text-gray-600"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-gray-900">Profile</h1>
      </div>

      <div className="bg-white rounded-2xl p-5 space-y-4 shadow-sm mb-4">
        <div className="text-center pb-2">
          <div className="w-16 h-16 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-2">
            {(userProfile?.full_name ?? user.email ?? 'U').charAt(0).toUpperCase()}
          </div>
          <p className="font-semibold text-gray-900">{userProfile?.full_name ?? 'User'}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
          <span className="inline-block mt-1 bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full capitalize">{userProfile?.role ?? 'inspector'}</span>
        </div>

        <div className="space-y-3 pt-2">
          {[
            { label: 'Full Name', key: 'full_name', placeholder: 'Your full name' },
            { label: 'Employee ID', key: 'employee_id', placeholder: 'Optional' },
            { label: 'Default Location', key: 'default_location', placeholder: 'Default inspection location' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
              <input
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              />
            </div>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-[#1e3a5f] text-white rounded-xl font-medium disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {company && (
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Organization</p>
          <p className="font-semibold text-gray-900">{company.name}</p>
          <p className="text-sm text-gray-500 capitalize mt-0.5">{company.subscription_tier} plan</p>
        </div>
      )}

      <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-3 text-red-600 border border-red-200 rounded-xl font-medium">
        <LogOut size={18} /> Sign Out
      </button>
    </div>
  )
}
