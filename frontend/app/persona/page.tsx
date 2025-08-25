// app/persona/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// --- normalize backend base so cookies work (localhost vs 127.0.0.1) ---
function normalizeBackendBase(raw: string): string {
  try {
    const u = new URL(raw)
    if (typeof window !== 'undefined') {
      const currentHost = window.location.hostname
      if (
        (u.hostname === '127.0.0.1' && currentHost === 'localhost') ||
        (u.hostname === 'localhost' && currentHost === '127.0.0.1')
      ) {
        u.hostname = currentHost
      }
    }
    return u.origin
  } catch {
    return raw
  }
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

// (key -> label -> image)
const OPTIONS: { key: string; label: string; img: string }[] = [
  { key: 'food',         label: 'Yemek',             img: '/cruise.png' },
  { key: 'history',      label: 'Tarih',             img: '/history.png' },
  { key: 'nature',       label: 'Doğa',              img: '/nature.png' },
  { key: 'adventure',    label: 'Macera',            img: '/spor.png' },
  { key: 'culture',      label: 'Sanat ve Kültür',   img: '/culture.png' },
  { key: 'shopping',     label: 'Alışveriş',         img: '/shoppingmall.png' },
  { key: 'kids',         label: 'Aile/Çocuk',        img: '/kids.png' },
  { key: 'landscape',    label: 'Manzara',           img: '/landscape.png' },
]

// Basit cookie okuma helper (auth cookie'sinden kimlik kontrolü)
/** returns cookie string value or null */
// function getCookie(name: string) {
//   if (typeof document === 'undefined') return null
//   const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'))
//   return m ? decodeURIComponent(m[1]) : null
// }

function Card({
  label, img, selected, onToggle,
}: { label: string; img: string; selected: boolean; onToggle: () => void }) {
  const [ok, setOk] = useState(true)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      role="switch"
      className={`group relative overflow-hidden rounded-2xl border transition shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        selected ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-200 hover:border-gray-300'
      }`}
      style={{ aspectRatio: '4 / 3' }}
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt={label}
          onError={() => setOk(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-100 to-blue-100" />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
      <div className="absolute left-3 bottom-3 right-3 flex items-center justify-between">
        <span className="text-white drop-shadow text-lg font-semibold">{label}</span>
        <span
          className={`h-7 w-7 grid place-items-center rounded-full border ${
            selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/90 text-gray-600 border-gray-200'
          }`}
        >
          {selected ? '✓' : '+'}
        </span>
      </div>
    </button>
  )
}

export default function PersonaPage() {
  const router = useRouter()
  const [base, setBase] = useState<string>('')

  useEffect(() => {
    const raw = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
    setBase(normalizeBackendBase(raw))
  }, [])

  // Artık e‑posta alanı yok; auth cookie/JWT üzerinden backend kimliği çözecek
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [authOk, setAuthOk] = useState<boolean>(false)
  const [authLoading, setAuthLoading] = useState<boolean>(true)
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      setAuthLoading(true)
      try {
        if (!base) return
        const r = await fetch(`${base}/auth/me`, { credentials: 'include', cache: 'no-store' })
        if (!cancelled) {
          if (r.status === 200) {
            const j = await r.json().catch(() => ({}))
            setMe(j)
            setAuthOk(true)
          } else {
            setAuthOk(false)
          }
        }
      } catch {
        if (!cancelled) setAuthOk(false)
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }
    checkAuth()
    return () => { cancelled = true }
  }, [base])

  useEffect(() => {
    let cancelled = false
    async function pullServerSelections() {
      if (!authOk || !base) return
      try {
        const r = await fetch(`${base}/persona/get`, { credentials: 'include', cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json().catch(() => ({}))
        const serverPicked: string[] = Array.isArray(j?.selections) ? j.selections : []
        if (!cancelled && serverPicked.length) {
          // LocalStorage'da var ise birleştir, yoksa direkt sunucudan geleni kullan
          try {
            const raw = localStorage.getItem('personaSelections')
            if (raw) {
              const local = JSON.parse(raw)
              const merged = uniq([...(Array.isArray(local) ? local : []), ...serverPicked])
              setPicked(merged)
              localStorage.setItem('personaSelections', JSON.stringify(merged))
            } else {
              setPicked(serverPicked)
              localStorage.setItem('personaSelections', JSON.stringify(serverPicked))
            }
          } catch {
            setPicked(serverPicked)
          }
        }
      } catch {}
    }
    pullServerSelections()
    return () => { cancelled = true }
  }, [authOk, base])

  // localStorage'dan önceki seçimler
  useEffect(() => {
    try {
      const raw = localStorage.getItem('personaSelections')
      if (raw) setPicked(JSON.parse(raw))
    } catch {}
  }, [])

  // seçimleri her değiştiğinde sakla
  useEffect(() => {
    try { localStorage.setItem('personaSelections', JSON.stringify(picked)) } catch {}
  }, [picked])

  const canSave = picked.length > 0 && authOk

  function toggle(key: string) {
    setPicked((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  async function handleSave() {
    setMsg(null)
    if (!canSave) {
      setMsg('Giriş yapman gerekiyor.')
      return
    }
    if (!authOk) {
      setMsg('Giriş yapman gerekiyor.')
      return
    }

    try {
      setSaving(true)
      // Body'de SADECE selections gidiyor. Kimlik, backend tarafından cookie/JWT ile çözülecek.
      const res = await fetch(`${base}/persona/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: picked }),
        credentials: 'include', // cookie/JWT gönder
      })
      if (res.status === 401) {
        throw new Error('Oturum geçersiz. Lütfen giriş yapın.')
      }
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.detail || 'Kaydedilemedi')
      setMsg('Tercihler kaydedildi! Çark şimdi bu eğilimleri kullanabilecek.')
      try { localStorage.setItem('personaSelections', JSON.stringify(picked)) } catch {}
      router.push('/home')
    } catch (e: any) {
      setMsg(`Hata: ${e.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  const headerText = useMemo(
    () => 'Seyahat planlaman için sana yardımcı olmak istiyoruz. En çok nelerle ilgileniyorsun?',
    []
  )

  return (
    <main className="min-h-screen bg-[#ECF0F1] px-6 py-10 lg:px-32 font-sans text-[#2C3E50]">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Tercihlerini Seç</h1>
        {!authLoading && !authOk && (
          <>
            <p className="text-sm text-red-600 mt-2">
              Giriş yapılmadı gibi görünüyor. Lütfen önce giriş yapın; ardından tercihleriniz hesabınıza kaydedilecektir.
            </p>
            <button
              onClick={() => router.push('/auth')}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-white text-sm hover:bg-blue-700"
            >
              Giriş Yap
            </button>
          </>
        )}
        {authOk && me?.email && (
          <p className="text-sm text-gray-600 mt-1">Giriş yapan: <span className="font-medium">{me.email}</span></p>
        )}
        <p className="text-gray-700 mt-1">{headerText}</p>
      </header>

      {/* Kart ızgarası */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {OPTIONS.map((o) => (
          <Card
            key={o.key}
            label={o.label}
            img={o.img}
            selected={picked.includes(o.key)}
            onToggle={() => toggle(o.key)}
          />
        ))}
      </section>

      {/* Alt bar */}
      <div className="sticky bottom-0 mt-8 bg-gradient-to-t from-white to-transparent pt-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-white/95 backdrop-blur px-4 py-3 shadow-sm">
          <div className="text-sm text-gray-700">
            Seçili: <span className="font-semibold text-blue-700">{picked.length}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={`px-4 py-2 rounded-lg text-white shadow ${
              !canSave || saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {saving ? 'Kaydediliyor…' : 'Devam Et'}
          </button>
          {msg && <div className="text-sm text-gray-800">{msg}</div>}
          {!msg && (
            <div className="text-xs text-gray-500">
              Seçimlerin profilinde saklanır; ana sayfada “Çarkı Çevir” önerilerini buna göre kişiselleştirir.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
