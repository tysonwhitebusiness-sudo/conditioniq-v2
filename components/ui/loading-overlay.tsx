'use client'

interface LoadingOverlayProps {
  show: boolean
  fullScreen?: boolean
}

export default function LoadingOverlay({ show, fullScreen = false }: LoadingOverlayProps) {
  if (!show) return null

  return (
    <div style={{
      position: fullScreen ? 'fixed' : 'absolute',
      inset: 0,
      zIndex: fullScreen ? 9999 : 10,
      background: 'rgba(13, 27, 42, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: fullScreen ? undefined : 'inherit',
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '3px solid rgba(0, 180, 216, 0.2)',
        borderTopColor: '#00B4D8',
        animation: 'spin 0.75s linear infinite',
        flexShrink: 0,
      }} />
    </div>
  )
}
