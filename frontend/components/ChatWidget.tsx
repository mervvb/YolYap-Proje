'use client'
import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

// Helper function to format messages with line breaks
function formatMessage(content: string): string {
  return content.replace(/\n/g, '<br />')
}

export default function ChatWidget({
  initialMessage,
  onClose,
}: {
  initialMessage?: string
  onClose?: () => void
}) {
  const [messages, setMessages] = useState<Msg[]>(
    initialMessage ? [{ role: 'assistant', content: initialMessage }] : []
  )
  const [input, setInput] = useState('')
  const [routePlanned, setRoutePlanned] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)
  const [stopCount, setStopCount] = useState<number | null>(null)
  const [region, setRegion] = useState<string | null>(null)

  // --- Draggable panel state & handlers ---
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const draggingRef = useRef<{ dx: number; dy: number } | null>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 350, height: 520 })
  const resizingRef = useRef<{ mx: number; my: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (pos === null && typeof window !== 'undefined') {
      const pad = 16
      const width = 350
      const height = 520
      const left = Math.max(8, window.innerWidth - width - pad)
      const top = Math.max(8, window.innerHeight - height - pad)
      setPos({ left, top })
      setSize({ width, height })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onDragStart(e: React.MouseEvent) {
    if (e.button !== 0) return
    const parent = (e.currentTarget as HTMLDivElement).parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    draggingRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    document.body.style.userSelect = 'none'
  }
  function onDragMove(e: MouseEvent) {
    const d = draggingRef.current
    if (!d) return
    const left = Math.min(window.innerWidth - 80, Math.max(8, e.clientX - d.dx))
    const top = Math.min(window.innerHeight - 80, Math.max(8, e.clientY - d.dy))
    setPos({ left, top })
  }
  function onDragEnd() {
    draggingRef.current = null
    document.body.style.userSelect = ''
  }
  function onResizeStart(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (!pos) return
    resizingRef.current = { mx: e.clientX, my: e.clientY, w: size.width, h: size.height }
    document.body.style.userSelect = 'none'
  }
  function onResizeMove(e: MouseEvent) {
    const r = resizingRef.current
    if (!r || !pos) return
    const minW = 280
    const minH = 360
    const maxW = Math.max(minW, window.innerWidth - pos.left - 8)
    const maxH = Math.max(minH, window.innerHeight - pos.top - 8)
    const newW = Math.min(maxW, Math.max(minW, r.w + (e.clientX - r.mx)))
    const newH = Math.min(maxH, Math.max(minH, r.h + (e.clientY - r.my)))
    setSize({ width: newW, height: newH })
  }
  useEffect(() => {
    const mm = (e: MouseEvent) => {
      onDragMove(e)
      onResizeMove(e)
    }
    const mu = () => {
      onDragEnd()
      resizingRef.current = null
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', mm)
    window.addEventListener('mouseup', mu)
    return () => {
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('mouseup', mu)
    }
  }, [pos, size])

  // ---- API helper ----
  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8080'
  const apiFetch = (path: string, init?: RequestInit) =>
    fetch(`${API_BASE}${path}`, { mode: 'cors', ...init })

  // Turkish Airlines öneriler (daha THY odaklı)
  const defaultPrompts = [
    'İstanbul Ankara uçuş ara',
    'TK123 uçuş durumu',
    'Rezervasyon ABC123',
    'Topkapı Saray hakkında bilgi',
    'Kadıköy restoran öner',
    'İstanbul müzeler',
  ]

  // Takip soruları
  const feedbackPrompts = [
    'En ucuz seçenek',
    'Farklı tarih',
    'Business class',
    'Check-in durumu', 
    'Değişiklik ücreti',
    'İptal koşulları'
  ]

  async function handleQuickPrompt(msg: string) {
    if (!msg || !msg.trim()) return
    msg = msg.trim()

    const lower = msg.toLowerCase()

    const regionMatch = lower.match(/\b(istanbul|ankara|izmir|antalya|trabzon|adana)\b/)
    if (regionMatch) setRegion(regionMatch[1])

    const durationMatch = lower.match(/(\d+)\s*saat/)
    if (durationMatch) setDuration(parseInt(durationMatch[1]))

    const stopMatch = lower.match(/(\d+)\s*(yer|durak)/)
    if (stopMatch) setStopCount(parseInt(stopMatch[1]))

    setMessages((prev) => [...prev, { role: 'user', content: msg }])

    try {
      const res = await apiFetch('/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, use_mcp: true }),
      })

      const ct = res.headers.get('content-type') || ''
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Hata: ${res.status} ${text.slice(0, 180)}` },
        ])
        return
      }

      if (ct.includes('application/json')) {
        const data = await res.json()
        const reply = (data && (data.reply || data.answer || data.message)) || 'Anlaşıldı.'
        setMessages((prev) => [...prev, { role: 'assistant', content: String(reply) }])
      } else {
        const text = await res.text()
        setMessages((prev) => [...prev, { role: 'assistant', content: text || 'Yanıt alındı.' }])
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `İstek başarısız: ${String(e?.message || e)}` },
      ])
    }
  }

  function handleSend() {
    if (!input.trim()) return
    handleQuickPrompt(input)
    setInput('')
  }

  return (
    <div
      className="fixed z-[10000] bg-gradient-to-br from-blue-50 via-white to-blue-100 border border-gray-200 rounded-2xl shadow-2xl p-4 flex flex-col backdrop-blur-sm"
      style={pos ? { left: pos.left, top: pos.top, width: size.width, height: size.height } : { right: 16, bottom: 16, width: size.width, height: size.height }}
    >
      {/* Drag handle (üst bar) */}
      <div
        onMouseDown={onDragStart}
        className="-mt-2 -mx-2 px-2 pt-2 pb-1 cursor-move rounded-t-2xl"
        title="Taşı"
        aria-label="Taşı"
      >
        <div className="h-1.5 w-16 mx-auto bg-gray-300 rounded-full" />
      </div>

      {onClose && (
        <button
          onClick={onClose}
          aria-label="Kapat"
          title="Kapat"
          className="absolute top-2 right-2 z-[10001] h-8 w-8 rounded-full bg-black/70 text-white hover:bg-black flex items-center justify-center shadow"
        >
          ✕
        </button>
      )}

      <div className="mb-2 bg-white border border-gray-300 rounded-md shadow-md p-2">
        <div className="text-sm font-semibold mb-1 text-gray-700">Rotalist AI Asistan</div>
        <div className="flex flex-wrap gap-2">
          {(routePlanned ? feedbackPrompts : defaultPrompts).map((msg) => (
            <button
              key={msg}
              onClick={() => handleQuickPrompt(msg)}
              className="bg-blue-100 hover:bg-blue-200 text-sm px-3 py-1 rounded"
            >
              {msg}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mb-2">
        {messages.map((msg, idx) => (
          <div key={idx} className={`mb-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span
              className={`inline-block px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}
              dangerouslySetInnerHTML={{ 
                __html: formatMessage(msg.content) 
              }}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxWidth: '85%'
              }}
            />
          </div>
        ))}
      </div>

      <div className="relative mt-2">
        <input
          className="w-full border border-gray-300 rounded-full py-2 pl-4 pr-24 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          placeholder="Uçuş ara, durum sorgula..."
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-2">
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`px-4 py-1 rounded-full text-sm text-white ${
              input.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            Gönder
          </button>
        </div>
      </div>

      {/* Resize handle (bottom-right) */}
      <div
        onMouseDown={onResizeStart}
        title="Yeniden boyutlandır"
        aria-label="Yeniden boyutlandır"
        className="absolute right-2 bottom-2 h-4 w-4 cursor-se-resize"
        style={{
          background: 'linear-gradient(135deg, transparent 0 40%, #9ca3af 40% 60%, transparent 60% 100%)'
        }}
      />
    </div>
  )
}
