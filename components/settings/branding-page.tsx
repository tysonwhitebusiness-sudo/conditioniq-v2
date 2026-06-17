'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import { createLogoUploadUrl, saveLogoPath, removeLogo, getLogoSignedUrl, saveBusinessName } from '@/lib/branding-actions'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { ArrowLeft, Upload, X, Image as ImageIcon, Check, Building2 } from 'lucide-react'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_SIZE_MB = 5

export default function BrandingPage() {
  const { effectiveCompany } = useAuth()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null)
  const [currentLogoPath, setCurrentLogoPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  useEffect(() => {
    if (!effectiveCompany?.id) return
    createClient()
      .from('companies')
      .select('logo_url, name')
      .eq('id', effectiveCompany.id)
      .single()
      .then(async ({ data }) => {
        if (data?.logo_url) {
          setCurrentLogoPath(data.logo_url)
          const url = await getLogoSignedUrl(data.logo_url)
          if (url) setCurrentLogoUrl(url)
        }
        if (data?.name) setBusinessName(data.name)
        setLoading(false)
      })
  }, [effectiveCompany?.id])

  const handleFileSelect = (file: File) => {
    setError('')
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please upload a PNG, JPEG, WebP, or SVG file.')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_SIZE_MB}MB.`)
      return
    }
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleUpload = async () => {
    if (!selectedFile || !effectiveCompany?.id) return
    setUploading(true)
    setError('')
    try {
      const ext = selectedFile.name.split('.').pop() ?? 'png'
      const uploadAuth = await createLogoUploadUrl(effectiveCompany.id, ext)
      if (!uploadAuth) throw new Error('Could not get upload URL')

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .uploadToSignedUrl(uploadAuth.path, uploadAuth.token, selectedFile, { contentType: selectedFile.type, upsert: true })
      if (uploadError) throw uploadError

      await saveLogoPath(effectiveCompany.id, uploadAuth.path)
      setCurrentLogoPath(uploadAuth.path)
      setCurrentLogoUrl(preview)
      setSelectedFile(null)
      setPreview(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    if (!effectiveCompany?.id) return
    setRemoving(true)
    await removeLogo(effectiveCompany.id)
    setCurrentLogoUrl(null)
    setCurrentLogoPath(null)
    setPreview(null)
    setSelectedFile(null)
    setRemoving(false)
  }

  const handleSaveName = async () => {
    if (!effectiveCompany?.id || !businessName.trim()) return
    setNameSaving(true)
    try {
      await saveBusinessName(effectiveCompany.id, businessName.trim())
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2500)
    } finally { setNameSaving(false) }
  }

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{
        padding: isDesktop ? '24px 28px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 640, margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={16} color="#0D1B2A" />
          </button>
          <div>
            <h1 style={{ fontSize: isDesktop ? 22 : 18, fontWeight: 900, color: '#0D1B2A', margin: 0 }}>White Label Branding</h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Your logo appears on inspection reports and invoices</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Current Logo */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>Current Logo</p>
              {currentLogoUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 120, height: 60, border: '1px solid #E1E8F0', borderRadius: 10, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={currentLogoUrl} alt="Company logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, color: '#374151', margin: '0 0 8px' }}>Logo uploaded. Appears on all PDF reports and invoices.</p>
                    <button onClick={handleRemove} disabled={removing}
                      style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FFF', color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: removing ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: removing ? 0.6 : 1 }}>
                      <X size={13} />{removing ? 'Removing…' : 'Remove Logo'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#94A3B8' }}>
                  <div style={{ width: 60, height: 60, border: '1.5px dashed #E1E8F0', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={24} color="#CBD5E1" />
                  </div>
                  <p style={{ fontSize: 13, margin: 0 }}>No logo uploaded. Reports will show "Condition IQ" branding.</p>
                </div>
              )}
            </div>

            {/* Business Name */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>Business Name on Reports</p>
              <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 12px', lineHeight: 1.5 }}>
                Appears alongside your logo on PDF reports and invoices.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                  <Building2 size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, flexShrink: 0 }} />
                  <input
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="Your Company Name"
                    style={{ width: '100%', height: 44, border: '1.5px solid #E1E8F0', borderRadius: 10, padding: '0 12px 0 36px', fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
                <button onClick={handleSaveName} disabled={nameSaving || !businessName.trim()}
                  style={{ height: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: nameSaved ? '#10B981' : '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: nameSaving || !businessName.trim() ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: nameSaving || !businessName.trim() ? 0.6 : 1, transition: 'background 300ms ease', flexShrink: 0 }}>
                  {nameSaved ? <><Check size={14} />Saved!</> : nameSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {/* Upload */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>Upload New Logo</p>

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #E1E8F0', borderRadius: 12, padding: '28px 20px',
                  textAlign: 'center', cursor: 'pointer',
                  background: preview ? '#F8FAFC' : '#FAFAFA',
                  marginBottom: 14,
                }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                />
                {preview ? (
                  <div>
                    <img src={preview} alt="Preview" style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain', marginBottom: 8 }} />
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{selectedFile?.name}</p>
                  </div>
                ) : (
                  <>
                    <Upload size={28} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#4A5568', margin: '0 0 4px' }}>Click or drag to upload</p>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>PNG, JPEG, WebP, SVG · Max {MAX_SIZE_MB}MB</p>
                  </>
                )}
              </div>

              {error && <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{error}</p>}

              {selectedFile && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setSelectedFile(null); setPreview(null); setError('') }}
                    style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Clear
                  </button>
                  <button onClick={handleUpload} disabled={uploading}
                    style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: saved ? '#10B981' : '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: uploading ? 0.7 : 1, transition: 'background 300ms ease' }}>
                    {saved ? <><Check size={15} />Saved!</> : uploading ? 'Uploading…' : <><Upload size={15} />Upload Logo</>}
                  </button>
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ background: '#F0F4F8', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.6 }}>
                <strong>Recommended:</strong> Square or horizontal logo · PNG with transparent background · Min 200×60px for best quality on PDFs.
              </p>
            </div>

          </div>
        )}

        <BottomNav />
      </div>
    </>
  )
}
