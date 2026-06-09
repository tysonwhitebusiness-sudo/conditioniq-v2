'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff } from 'lucide-react'

interface VoiceInputProps {
  onTranscript: (text: string) => void
}

export default function VoiceInput({ onTranscript }: VoiceInputProps) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  const toggle = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      onTranscript(transcript)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }, [listening, onTranscript])

  return (
    <button
      type="button"
      onClick={toggle}
      className={`p-2 rounded-full transition-colors ${listening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
      title={listening ? 'Stop recording' : 'Start voice input'}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  )
}
