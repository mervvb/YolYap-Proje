'use client'

import 'leaflet/dist/leaflet.css'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const ChatWidget = dynamic(() => import('../../components/ChatWidget'), { ssr: false })

// ---- ENV ----
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

function ensureAbsUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("/")) {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
    return base ? `${base}${url}` : url;
  }
  return url;
}
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
const MAPBOX_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE || 'mapbox/streets-v12'

// ---- HELPERS ----
const apiFetch = (path: string, init?: RequestInit) =>
  fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, { mode: 'cors', ...init })

const mbFetch = (url: string, init?: RequestInit) => {
  if (!MAPBOX_TOKEN) throw new Error('Mapbox token yok')
  const u = new URL(url)
  u.searchParams.set('access_token', MAPBOX_TOKEN)
  if (!u.searchParams.has('language')) u.searchParams.set('language', 'tr')
  return fetch(u.toString(), init)
}

// types
type Place = { id: string; name: string; lat: number; lng: number }
function uid() {
  return typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

// ---- PERSONA & ÇARK ----
type Persona = { name: string; key: string; emoji: string; sample: string }

const PERSONAS: Persona[] = [
  { name: 'Tarih Meraklısı',  key: 'history',      emoji: '📜', sample: 'Tarihi Yarımada Hızlı Keşif' },
  { name: 'Lezzet Avcısı',    key: 'food',         emoji: '🍴', sample: 'Şehir Merkezi Kafe Rotası' },
  { name: 'Doğa Kaşifi',      key: 'nature',       emoji: '🌿', sample: 'Boğaz Hattı Mini Tur' },
  { name: 'Kültür Tutkunu',   key: 'culture',      emoji: '🎭', sample: 'Müze Sevenlere Öneri' },
  { name: 'Alışveriş Meraklısı', key: 'shopping',  emoji: '🛍️', sample: 'Nostaljik Çarşı Turu' },
  { name: 'Macera Sever',     key: 'adventure',    emoji: '🧗', sample: 'Adrenalin Durağı Mini' },
  { name: 'Deniz Tutkunu',    key: 'seaside',      emoji: '🌊', sample: 'Sahil Yürüyüşü Kısa Tur' },
  { name: 'Eğlence Arayıcısı', key: 'entertainment', emoji: '🎉', sample: 'Gece Hayatı Mini Rota' },
]

// --- Helpers shared across components ---
function cleanLine(t?: string | null) {
  if (!t) return '';
  // Remove inline appended error like: (Görsel üretimi başarısız: ...)
  const noErr = t.replace(/\(Görsel üretimi başarısız:[\s\S]*\)$/i, '').trim();
  return noErr;
}

function parseNumbered(t?: string | null): string[] {
  if (!t) return [];
  const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  // Keep only lines that start with 1., 2., 3. etc.
  const items = lines.filter(s => /^\d+\./.test(s)).slice(0,3);
  return items;
}

// Mekan adı filtreleyici: cadde/sokak/yol gibi adresleri eleyip, gerçek mekan isimlerini bırakır
function isVenueName(name?: string): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  // elemek istediklerimiz
  const bad = [
    'yolu','yol','sokağı','sokak','sok.','cd.','cad.','caddesi','bulvarı','blv.','mahalle','mh.','street','road','avenue'
  ]
  if (bad.some(k => n.includes(k))) return false
  // izin verilen bazı mekan ipuçları
  const good = [
    'müze','saray','kale','kalesi','antik','örenyeri','bazaar','çarşı','avm','market','restoran','restaurant','kafe','cafe','mağaza','galeri','tiyatro','opera','arkeoloji'
  ]
  return good.some(k => n.includes(k))
}

// ---- ÇARK MODAL ----
function WheelModal({
  open, onClose, spinning, spinAngle, onSpin, result,
  genLoading, genError, genImageUrl, genCaption, genLine, genBlurb, genPlaces
}: {
  open: boolean
  onClose: () => void
  spinning: boolean
  spinAngle: number
  onSpin: () => void
  result: Persona | null
  genLoading: boolean
  genError: string | null
  genImageUrl: string | null
  genCaption: string | null
  genLine: string | null
  genBlurb: string | null
  genPlaces: Array<{ name: string; distance_km?: number; tags?: string[] }>
}) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => { setImgError(false) }, [genImageUrl, genLoading])
  if (!open) return null
  return (
    <>
      {/* arkaplan */}
      <div className="fixed inset-0 z-[2000] bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* modal */}
      <div className="fixed z-[2100] inset-0 flex items-center justify-center p-3">
        <div className="w-full max-w-[560px] bg-white rounded-2xl shadow-xl border border-gray-200 p-4 relative max-h-[85vh] overflow-auto">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 text-gray-500 hover:text-gray-700 text-lg"
            aria-label="Kapat"
          >✖</button>

          <h3 className="text-xl font-semibold text-center">🎡 Çarkı Çevir — Hangi Rotalistsin?</h3>
          <div className="mt-6 grid place-items-center">
            <div className="relative w-56 h-56 sm:w-64 sm:h-64">
              {/* işaretçi */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-red-600 drop-shadow" />
              </div>

              {/* çark */}
              <div
                className="w-full h-full rounded-full border-8 border-indigo-200 grid place-items-center transition-transform"
                style={{
                  transform: `rotate(${spinAngle}deg)`,
                  transitionDuration: spinning ? '2200ms' : '300ms',
                  transitionTimingFunction: spinning ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'ease'
                }}
              >
                {/* SVG dilimli çark */}
                <svg viewBox="0 0 100 100" className="w-[85%] h-[85%] rounded-full shadow-inner">
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#dbeafe" />
                      <stop offset="100%" stopColor="#bfdbfe" />
                    </linearGradient>
                    <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e9d5ff" />
                      <stop offset="100%" stopColor="#c4b5fd" />
                    </linearGradient>
                  </defs>
                  {Array.from({ length: 8 }).map((_, i) => {
                    const step = 360 / 8
                    const start = (i * step) * (Math.PI / 180)
                    const end = ((i + 1) * step) * (Math.PI / 180)
                    const x1 = 50 + 50 * Math.cos(start), y1 = 50 + 50 * Math.sin(start)
                    const x2 = 50 + 50 * Math.cos(end),   y2 = 50 + 50 * Math.sin(end)
                    return (
                      <path
                        key={i}
                        d={`M50,50 L${x1},${y1} A50,50 0 0 1 ${x2},${y2} z`}
                        fill={i % 2 === 0 ? 'url(#g1)' : 'url(#g2)'}
                        stroke="#ffffff"
                        strokeWidth="0.6"
                      />
                    )
                  })}
                  {/* ortadaki kapak */}
                  <circle cx="50" cy="50" r="10" fill="#1d4ed8" />
                </svg>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={onSpin}
                disabled={spinning}
                className={`px-4 py-2 rounded-lg text-white shadow ${
                  spinning ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {spinning ? 'Dönüyor…' : 'Çevir'}
              </button>
            </div>
          </div>

          {/* Persona görsel alanı (liste yerine görsel) */}
          <div className="mt-5">
            {genLoading ? (
              <div className="mx-auto my-2 rounded-xl border border-gray-200 shadow-sm overflow-hidden aspect-square w-[260px] sm:w-[300px] bg-gradient-to-r from-gray-100 to-gray-200 animate-pulse grid place-items-center text-gray-500 text-sm">
                Görsel oluşturuluyor…
              </div>
            ) : genImageUrl ? (
              <>
              {!imgError ? (
                <div className="mx-auto my-2 rounded-xl border border-gray-200 shadow-sm overflow-hidden aspect-square w-[260px] sm:w-[300px]">
                  <img
                    src={genImageUrl}
                    alt="AI görsel"
                    className="w-full h-full object-contain bg-white"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : (
                <div className="mx-auto my-2 rounded-xl border border-red-200 bg-red-50 grid place-items-center text-red-600 text-sm aspect-square w-[260px] sm:w-[300px]">
                  Görsel yüklenemedi
                </div>
              )}
              {genImageUrl && (
                <div className="flex items-center gap-2 mt-2">
                  <a
                    href={genImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                  >
                    Yeni sekmede aç
                  </a>
                  <button
                    className="text-xs rounded border border-blue-200 text-blue-700 px-3 py-1 hover:bg-blue-50"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(genImageUrl!)
                        alert('Görsel bağlantısı kopyalandı!')
                      } catch {
                        alert('Kopyalanamadı, görsele sağ tıklayıp “Resim adresini kopyala”yı deneyin.')
                      }
                    }}
                  >
                    URL’yi kopyala
                  </button>
                </div>
              )}
              </>
            ) : (
              <div className="w-full h-40 sm:h-44 rounded-xl border border-gray-200 shadow-sm bg-white grid place-items-center text-gray-500 text-sm">
                Görsel hazır olduğunda burada görünecek
              </div>
            )}
          </div>

          

          {/* AI Görsel & Caption */}
          {result && (
            <div className="mt-6">
          {genLoading && (
            <div className="text-center text-blue-600 font-semibold">AI görsel oluşturuluyor…</div>
          )}
          {/* Hata mesajını gizledik (istenirse tekrar açılabilir)
          {genError && (
            <div className="text-center mt-2">
              <span className="inline-block bg-red-100 text-red-800 border border-red-200 px-3 py-1 rounded-md text-sm">{genError}</span>
            </div>
          )}
          */}
              {(genImageUrl || genCaption || genLine) && (
                <div className="mt-3 flex flex-col items-center">
                  {genImageUrl && (
                    <button
                      className="mt-2 text-xs px-3 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(genImageUrl!)
                          alert('Görsel bağlantısı kopyalandı!')
                        } catch {
                          alert('Kopyalanamadı, görsele sağ tıklayıp “Resim adresini kopyala”yı deneyin.')
                        }
                      }}
                    >
                      Görsel URL’sini kopyala
                    </button>
                  )}
                  {genCaption && (
                    <div className="mt-2 text-sm font-semibold text-blue-900">{genCaption}</div>
                  )}
                  {cleanLine(genLine) && (
                    <div className="mt-1 text-[13px] leading-snug text-blue-900 bg-blue-50/80 border border-blue-200 rounded-md px-3 py-2 text-center break-words">
                      {cleanLine(genLine)}
                    </div>
                  )}
                  {(parseNumbered(genBlurb).length > 0) ? (
                    <ol className="mt-2 text-[13px] text-gray-800 bg-gray-50/70 border border-gray-200 rounded-md px-3 py-2 space-y-0.5 text-left">
                      {parseNumbered(genBlurb).map((it, idx) => (
                        <li key={idx} className="leading-snug">{it}</li>
                      ))}
                    </ol>
                  ) : (genBlurb ? (
                    <div className="mt-2 text-[13px] text-gray-800 bg-gray-50/70 border border-gray-200 rounded-md px-3 py-2 text-center break-words">
                      {genBlurb}
                    </div>
                  ) : null)}
                  {Array.isArray(genPlaces) && genPlaces.length > 0 && (
                    <ul className="mt-2 w-full text-xs text-gray-700 border-t pt-2 space-y-1">
                      {genPlaces.filter(p => isVenueName(p.name)).slice(0, 2).map((p, i) => (
                        <li key={`${p.name}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <span className="min-w-0 truncate">📍 {p.name}</span>
                          <span className="text-[11px] text-gray-500 whitespace-nowrap">
                            {typeof p.distance_km === 'number' ? `${p.distance_km.toFixed(1)} km` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function HomePage() {
  // --- STATE ---
  const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [showChat, setShowChat] = useState(false)

  const [timeBudget, setTimeBudget] = useState<number>(120) // dakika
  const [timeMode, setTimeMode] = useState<'quick' | 'slider' | 'clock'>('quick')
  const [startTime, setStartTime] = useState('13:00')
  const [endTime, setEndTime] = useState('15:00')

  const [startAnchor, setStartAnchor] = useState<{ lat: number; lng: number } | null>(null)
  const [startMarkerId, setStartMarkerId] = useState<string | null>(null)
  const [isPickingStart, setIsPickingStart] = useState(false)

  const [isPlanning, setIsPlanning] = useState(false)
  const [routeInfo, setRouteInfo] = useState<{ distanceMeters: number; duration: string } | null>(null)

  // search box (Mapbox Temporary Geocoding)
  const [q, setQ] = useState('')
  const [suggests, setSuggests] = useState<Array<{ title: string; lat: number; lng: number }>>([])
  const qDebounceRef = useRef<any>(null)

  // Leaflet refs
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Record<string, any>>({})
  const routeLineRef = useRef<any | null>(null)
  const defaultIconRef = useRef<any>(null)
  const startIconRef = useRef<any>(null)
  const startOnlyMarkerRef = useRef<any>(null)
  const isPickingStartRef = useRef(false)
  useEffect(() => { isPickingStartRef.current = isPickingStart }, [isPickingStart])

  // persist (localStorage)
  const STORAGE_KEY = 'yolyap.home.v5'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const s = JSON.parse(raw)
      if (Array.isArray(s.selectedPlaces)) setSelectedPlaces(s.selectedPlaces)
      if (s.startAnchor) setStartAnchor(s.startAnchor)
      if (s.startMarkerId) setStartMarkerId(s.startMarkerId)
      if (typeof s.timeMode === 'string') setTimeMode(s.timeMode)
      if (typeof s.timeBudget === 'number') setTimeBudget(s.timeBudget)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ selectedPlaces, startAnchor, startMarkerId, timeMode, timeBudget })
      )
    } catch {}
  }, [selectedPlaces, startAnchor, startMarkerId, timeMode, timeBudget])

  // Order değiştiğinde/başlangıç güncellendiğinde marker numaralarını tazele
  useEffect(() => {
    try { renumberMarkers() } catch {}
  }, [selectedPlaces, startMarkerId, startAnchor])

  // numbered icon
  function makeNumberedIcon(n: number, isStart = false) {
    const L: any = (window as any).L
    if (!L) return null
    const color = isStart ? '#EF4444' : '#2563EB'
    return L.divIcon({
      className: 'numbered-marker',
      html: `
        <div style="position:relative;display:inline-block;">
          <div style="background:${color};width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>
          <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-58%);color:#fff;font-weight:700;font-size:12px;line-height:1;">${n}</div>
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    })
  }

  function renumberMarkers() {
    const L: any = (window as any).L
    if (!L || !mapRef.current) return
    const hasCustomStart = !startMarkerId && !!startAnchor

    if (hasCustomStart) {
      if (!startOnlyMarkerRef.current) {
        startOnlyMarkerRef.current = L.marker([startAnchor!.lat, startAnchor!.lng], {
          icon: makeNumberedIcon(1, true),
          zIndexOffset: 1000,
        }).addTo(mapRef.current)
      } else {
        startOnlyMarkerRef.current.setLatLng([startAnchor!.lat, startAnchor!.lng])
        startOnlyMarkerRef.current.setIcon(makeNumberedIcon(1, true))
      }
    } else if (startOnlyMarkerRef.current) {
      try { mapRef.current.removeLayer(startOnlyMarkerRef.current) } catch {}
      startOnlyMarkerRef.current = null
    }

    const list = selectedPlaces.slice()
        if (startMarkerId) {
      // Numara sırası her zaman selectedPlaces sırası olsun.
      // startMarkerId sadece işaretçiyi "başlangıç" (kırmızı) olarak vurgular.
      list.forEach((p, i) => {
        const m = markersRef.current[p.id]
        if (!m) return
        const isStart = p.id === startMarkerId
        const n = i + 1
        try { m.setIcon(makeNumberedIcon(n, isStart)) } catch {}
      })
      return
    }

    const base = hasCustomStart ? 2 : 1
    list.forEach((p, i) => {
      const m = markersRef.current[p.id]
      if (!m) return
      try { m.setIcon(makeNumberedIcon(base + i, false)) } catch {}
    })
  }

  // Leaflet yükle + Mapbox Static Tiles
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const L: any = await import('leaflet')
        ;(window as any).L = L

        if (cancelled || !mapEl.current) return

        // ikonlar
        defaultIconRef.current = L.divIcon({
          className: 'custom-default-icon',
          html: '<div style="background:#2563EB;border-radius:50%;width:14px;height:14px;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.1)"></div>',
          iconSize: [14,14], iconAnchor: [7,7],
        })
        startIconRef.current = L.divIcon({
          className: 'custom-start-icon',
          html: '<div style="background:#EF4444;border-radius:50%;width:18px;height:18px;border:2px solid white;box-shadow:0 0 0 2px #EF4444"></div>',
          iconSize: [18,18], iconAnchor: [9,9],
        })

        // Harita
        mapRef.current = L.map(mapEl.current).setView([41.01, 29.0], 12)

        // Mapbox Static Tiles (token yoksa OSM fallback)
        if (!MAPBOX_TOKEN) {
          console.warn('Mapbox token yok; OSM tile kullanılıyor.')
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
          }).addTo(mapRef.current)
        } else {
          L.tileLayer(`https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`, {
            tileSize: 512, zoomOffset: -1, attribution: '© Mapbox © OpenStreetMap', maxZoom: 20
          }).addTo(mapRef.current)

          // Trafik overlay (opsiyonel)
          try {
            L.tileLayer(
              `https://api.mapbox.com/styles/v1/mapbox/traffic-day-v2/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
              { tileSize: 512, zoomOffset: -1, opacity: 0.9, attribution: '© Mapbox — Traffic' }
            ).addTo(mapRef.current)
          } catch {}
        }

        // Persist’ten gelen yerleri bas
        if (selectedPlaces.length > 0) {
          for (const p of selectedPlaces) {
            const m = L.marker([p.lat, p.lng], { icon: defaultIconRef.current, draggable: true })
              .addTo(mapRef.current)
              .bindPopup(`📍 ${p.name}`)
            markersRef.current[p.id] = m
            attachDragHandlers(m, p.id)
          }
          renumberMarkers()
          fitToAll()
        }

        // click → nokta ekle
        mapRef.current.on('click', async (e: any) => {
          const { lat, lng } = e.latlng
          if (isPickingStartRef.current) {
            setStartMarkerId(null)
            setStartAnchor({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) })
            if (!startOnlyMarkerRef.current) {
              startOnlyMarkerRef.current = L.marker([lat, lng], { icon: makeNumberedIcon(1, true), zIndexOffset: 1000 }).addTo(mapRef.current)
            } else {
              startOnlyMarkerRef.current.setLatLng([lat, lng])
              startOnlyMarkerRef.current.setIcon(makeNumberedIcon(1, true))
            }
            setIsPickingStart(false)
            setTimeout(() => renumberMarkers(), 0)
            return
          }

          const name = await reverseGeocodeMB(lat, lng) || `Nokta (${(+lat).toFixed(4)}, ${(+lng).toFixed(4)})`
          const np: Place = { id: uid(), name, lat: +(+lat).toFixed(6), lng: +(+lng).toFixed(6) }
          setSelectedPlaces(prev => [...prev, np])
          const m = L.marker([np.lat, np.lng], { icon: defaultIconRef.current, draggable: true })
            .addTo(mapRef.current)
            .bindPopup(`📍 ${np.name}`)
          markersRef.current[np.id] = m
          attachDragHandlers(m, np.id)
          setTimeout(() => renumberMarkers(), 0)
        })

        setMapReady(true)
      } catch (err) {
        console.warn('[Map] Leaflet yüklenemedi (ESM):', err)
        setMapReady(false)
      }
    }

    void init()
    return () => {
      cancelled = true
      if (mapRef.current) { try { mapRef.current.remove() } catch {} ; mapRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // marker drag → reverse ad & koordinat güncelle
  function attachDragHandlers(marker: any, id: string) {
    marker.on('dragend', async () => {
      const ll = marker.getLatLng()
      const lat = +(ll.lat.toFixed(6)), lng = +(ll.lng.toFixed(6))
      setSelectedPlaces(prev => prev.map(p => p.id === id ? ({ ...p, lat, lng }) : p))
      try {
        const nm = await reverseGeocodeMB(lat, lng)
        if (nm) {
          setSelectedPlaces(prev => prev.map(p => p.id === id ? ({ ...p, name: nm }) : p))
          marker.bindPopup(`📍 ${nm}`)
        }
      } catch {}
      setTimeout(() => renumberMarkers(), 0)
    })
  }

  // ---- Geocoding (Temporary) ----
  async function reverseGeocodeMB(lat: number, lng: number) {
    if (!MAPBOX_TOKEN) return null
    const u = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}`
    try {
      const r = await mbFetch(u)
      if (!r.ok) return null
      const j = await r.json()
      const f = j?.features?.[0]
      return f?.properties?.full_address || f?.properties?.name || null
    } catch { return null }
  }

  async function searchSuggestsMB(text: string) {
    if (!text.trim() || !MAPBOX_TOKEN) { setSuggests([]); return }
    try {
      const u = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(text)}&limit=8`
      const r = await mbFetch(u, { cache: 'no-store' })
      const j = await r.json()
      const arr = (j?.features || []) as any[]
      const mapped = arr.map((f) => ({
        title: f?.properties?.full_address || f?.properties?.name || 'Sonuç',
        lat: f?.geometry?.coordinates?.[1] ?? 0,
        lng: f?.geometry?.coordinates?.[0] ?? 0,
      })).filter(x => x.lat && x.lng)
      setSuggests(mapped)
    } catch { setSuggests([]) }
  }

  function onType(v: string) {
    setQ(v)
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current)
    qDebounceRef.current = setTimeout(() => searchSuggestsMB(v), 350)
  }

  async function addFromSuggest(item: { title: string; lat: number; lng: number }) {
    const p: Place = { id: uid(), name: item.title, lat: +(+item.lat).toFixed(6), lng: +(+item.lng).toFixed(6) }
    setSelectedPlaces(prev => [...prev, p])
    const L: any = (window as any).L
    if (mapRef.current && L) {
      const m = L.marker([p.lat, p.lng], { icon: defaultIconRef.current, draggable: true })
        .addTo(mapRef.current)
        .bindPopup(`📍 ${p.name}`)
      markersRef.current[p.id] = m
      attachDragHandlers(m, p.id)
      mapRef.current.panTo([p.lat, p.lng])
      setTimeout(() => renumberMarkers(), 0)
    }
    setQ(''); setSuggests([])
  }

  // ---- CRUD & view ----
  function removePlace(id: string) {
    setSelectedPlaces(prev => prev.filter(p => p.id !== id))
    const m = markersRef.current[id]
    if (m) { try { mapRef.current?.removeLayer(m) } catch {} delete markersRef.current[id] }
    if (startMarkerId === id) { setStartMarkerId(null); setStartAnchor(null) }
    renumberMarkers()
  }

  function clearAll() {
    try {
      for (const m of Object.values(markersRef.current) as any[]) {
        try { mapRef.current?.removeLayer(m) } catch {}
      }
    } catch {}
    markersRef.current = {}
    if (routeLineRef.current) { try { mapRef.current?.removeLayer(routeLineRef.current) } catch {}; routeLineRef.current = null }
    setSelectedPlaces([]); setRouteInfo(null); setStartAnchor(null); setStartMarkerId(null)
    if (startOnlyMarkerRef.current && mapRef.current) { try { mapRef.current.removeLayer(startOnlyMarkerRef.current) } catch {}; startOnlyMarkerRef.current = null }
    try { renumberMarkers() } catch {}
  }

  function fitToAll() {
    const L: any = (window as any).L
    if (!mapRef.current || !L) return
    const pts: any[] = []
    if (startAnchor) pts.push([startAnchor.lat, startAnchor.lng])
    for (const p of selectedPlaces) pts.push([p.lat, p.lng])
    if (!pts.length) return
    mapRef.current.fitBounds(L.latLngBounds(pts), { padding: [30,30] })
  }

  // Polyline bazlı sıralama: rotanın geometrisine en yakın indekslere göre yerleri sırala
  function orderPlacesByGeometry(list: Place[], coords: Array<[number, number]>): Place[] {
    if (!Array.isArray(list) || !Array.isArray(coords) || !coords.length) return list
    const latlngs = coords.map((c) => ({ lat: c[1], lng: c[0] }))
    const scored = list.map((p) => {
      let bestIdx = 0, bestD = Infinity
      for (let i = 0; i < latlngs.length; i++) {
        const dlat = latlngs[i].lat - p.lat
        const dlng = latlngs[i].lng - p.lng
        const d = dlat * dlat + dlng * dlng
        if (d < bestD) { bestD = d; bestIdx = i }
      }
      return { p, bestIdx, bestD }
    })
    scored.sort((a, b) => (a.bestIdx - b.bestIdx) || (a.bestD - b.bestD))
    return scored.map(s => s.p)
  }

  // ---- ROTA: sadece backend /plan ----
  async function handleBuildRoute() {
    if (!mapRef.current) return alert('Harita hazır değil.')
    if (selectedPlaces.length < 2) return alert('En az 2 nokta seçin.')

    if (!startAnchor && !startMarkerId) {
      return alert('Başlangıç seçin: listeden “Başlangıç” ya da 🧭 ile haritadan.')
    }
    if (startMarkerId && !startAnchor) {
      const sp = selectedPlaces.find(s => s.id === startMarkerId)
      if (sp) setStartAnchor({ lat: sp.lat, lng: sp.lng })
    }

    const list = selectedPlaces.slice()
    const places = list.map(p => ({ lat: +p.lat, lng: +p.lng }))

    setIsPlanning(true)
    try {
      const h = await apiFetch('/health').catch(() => null)
      if (h && !h.ok) {
        const t = await h.text()
        throw new Error(t?.slice(0,180) || `Backend hazır değil (status ${h.status})`)
      }

      const res = await apiFetch('/plan', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ places, timeBudgetMin: timeBudget, anchor: startAnchor || null })
      })
      const raw = await res.text()
      if (!res.ok) throw new Error(raw?.slice(0,200) || `Status ${res.status}`)

      const data = raw ? JSON.parse(raw) : {}

      // --- Order handling ---
      let workingOrder: Place[] = list
      const hasBackendOrder = Array.isArray(data.order) || Array.isArray(data.placesOrdered)

      if (Array.isArray(data.order)) {
        const newOrder: Place[] = data.order.map((idx: number) => list[idx]).filter(Boolean)
        if (newOrder.length === list.length) {
          workingOrder = newOrder
          setSelectedPlaces(newOrder)
          // Kullanıcı özel başlangıç seçmediyse ilk noktayı başlangıç kabul et
          if (!startAnchor && !startMarkerId && newOrder[0]) {
            setStartMarkerId(newOrder[0].id)
            setStartAnchor({ lat: newOrder[0].lat, lng: newOrder[0].lng })
          }
          setTimeout(() => renumberMarkers(), 0)
        }
      } else if (Array.isArray(data.placesOrdered) && data.placesOrdered.length === list.length) {
        const ordered: Place[] = []
        const remaining = [...list]
        for (const pt of data.placesOrdered as Array<{lat:number,lng:number}>) {
          let bestIdx = 0, bestD = Infinity
          for (let i=0;i<remaining.length;i++) {
            const dlat = remaining[i].lat - pt.lat
            const dlng = remaining[i].lng - pt.lng
            const d = dlat*dlat + dlng*dlng
            if (d < bestD) { bestD = d; bestIdx = i }
          }
          ordered.push(remaining.splice(bestIdx,1)[0])
        }
        if (ordered.length === list.length) {
          workingOrder = ordered
          setSelectedPlaces(ordered)
          if (!startAnchor && !startMarkerId && ordered[0]) {
            setStartMarkerId(ordered[0].id)
            setStartAnchor({ lat: ordered[0].lat, lng: ordered[0].lng })
          }
          setTimeout(() => renumberMarkers(), 0)
        }
      }

      // çizgi
      const coords = data?.geometry?.coordinates
      if (!Array.isArray(coords) || !coords.length) throw new Error('Rota geometrisi yok')

      // Eğer backend bir sıralama vermediyse, geometriye göre sırala (backend verdiyse dokunma)
      if (!hasBackendOrder) {
        try {
          const orderedByGeom = orderPlacesByGeometry(workingOrder, coords as Array<[number, number]>)
          if (orderedByGeom.length === workingOrder.length) {
            workingOrder = orderedByGeom
            setSelectedPlaces(orderedByGeom)
            if (!startAnchor && !startMarkerId && orderedByGeom[0]) {
              setStartMarkerId(orderedByGeom[0].id)
              setStartAnchor({ lat: orderedByGeom[0].lat, lng: orderedByGeom[0].lng })
            }
            setTimeout(() => renumberMarkers(), 0)
          }
        } catch {}
      }
      const L: any = (window as any).L
      if (routeLineRef.current) { try { mapRef.current.removeLayer(routeLineRef.current) } catch {}; routeLineRef.current = null }
      const latlngs = coords.map((c: [number, number]) => [c[1], c[0]])
      const line = L.polyline(latlngs, { color: '#2563EB', weight: 5, opacity: 0.9 }).addTo(mapRef.current)
      routeLineRef.current = line
      mapRef.current.fitBounds(line.getBounds(), { padding: [30,30] })

      const warn = data?.withinBudget === false ? ' • ⚠ sürede yetişmiyor' : ''
      const durationSec = Number(data?.durationSec ?? data?.duration ?? 0)
      const distanceMeters = Number(data?.distanceMeters ?? data?.distance ?? 0)
      setRouteInfo({
        distanceMeters,
        duration: `${Math.max(1, Math.round(durationSec/60))} dk${warn}`,
      })
    } catch (e: any) {
      alert(`Rota alınamadı: ${e?.message || e}`)
    } finally {
      setIsPlanning(false)
    }
  }

  // clock → minutes
  function recomputeFromClock(a: string, b: string) {
    if (!a || !b) return
    const [ah, am] = a.split(':').map(Number)
    const [bh, bm] = b.split(':').map(Number)
    if ([ah, am, bh, bm].some(isNaN)) return
    let minutes = (bh*60 + bm) - (ah*60 + am)
    if (minutes < 0) minutes += 24*60
    setTimeBudget(minutes)
  }
  useEffect(() => { if (timeMode === 'clock') recomputeFromClock(startTime, endTime) }, [timeMode, startTime, endTime])

  // --- ÇARK state & mantık ---
  const [wheelOpen, setWheelOpen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [spinAngle, setSpinAngle] = useState(0)
  const [wheelResult, setWheelResult] = useState<Persona | null>(null)
  // AI Görsel/Caption state
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genImageUrl, setGenImageUrl] = useState<string | null>(null)
  const [genCaption, setGenCaption] = useState<string | null>(null)
  const [genLine, setGenLine] = useState<string | null>(null)
  const [genBlurb, setGenBlurb] = useState<string | null>(null)
  const [genPlaces, setGenPlaces] = useState<Array<{ name: string; distance_km?: number; tags?: string[] }>>([])
  const [imgErrorPreview, setImgErrorPreview] = useState(false)
  // --- User Location State ---
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLon, setUserLon] = useState<number | null>(null)
  useEffect(() => { setImgErrorPreview(false) }, [genImageUrl])
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(+pos.coords.latitude.toFixed(6))
        setUserLon(+pos.coords.longitude.toFixed(6))
      },
      () => { /* sessizce geç */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    )
  }, [])

  // Helper: authedFetch
  const authedFetch = (path: string, init?: RequestInit) =>
    fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, { credentials: 'include', mode: 'cors', cache: 'no-store', ...init })

  // Ayrı endpoint ile öneriyi paralel al
  async function fetchRecommendationsFor(lat: number | null, lon: number | null, selections: string[], radius_km = 300, limit = 2) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return
    try {
      console.debug('[reco] POST /gen/places/recommend_llm', { lat, lon, selections, radius_km, limit })
      const res = await authedFetch('/gen/places/recommend_llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, selections, radius_km, limit })
      })
      const j = await res.json().catch(()=>({}))
      if (!res.ok) throw new Error(j?.detail || `Status ${res.status}`)
      setGenBlurb(j?.blurb || null)
      setGenPlaces(Array.isArray(j?.items) ? j.items : [])
    } catch (e) {
      // öneri alınamazsa sessiz geç
    }
  }

  // AI generate for persona (backend/api/gen/routes.py → /gen/generate)
  async function generateForPersona(p: Persona) {
    // 1) Persona selections: localStorage + çarktan gelen persona anahtarı
    let selections: any[] = []
    try {
      const raw = localStorage.getItem('personaSelections')
      selections = raw ? JSON.parse(raw) : []
      if (!Array.isArray(selections)) selections = []
    } catch { selections = [] }
    // Çark sonucu gelen persona key'ini listede yoksa ekle
    if (p?.key && !selections.includes(p.key)) selections.push(p.key)

    // 2) Konum tercihi: başlangıç işaretçisi > tarayıcı konumu > harita merkezi
    let latPref: number | null = (startAnchor?.lat ?? null)
    let lonPref: number | null = (startAnchor?.lng ?? null)
    if (latPref == null || lonPref == null) {
      if (typeof userLat === 'number' && typeof userLon === 'number') {
        latPref = userLat; lonPref = userLon
      } else if (mapRef.current && (window as any).L) {
        try {
          const ctr = mapRef.current.getCenter()
          latPref = +(+ctr.lat).toFixed(6)
          lonPref = +(+ctr.lng).toFixed(6)
        } catch {}
      }
    }

    const body: any = { selections, hint: p.name }
    if (typeof latPref === 'number' && typeof lonPref === 'number') {
      body.lat = latPref
      body.lon = lonPref
      body.radius_km = 300
      body.limit = 2
    }
    // Ayrı endpoint ile öneriyi paralel al
    fetchRecommendationsFor(
      typeof latPref === 'number' ? latPref : null,
      typeof lonPref === 'number' ? lonPref : null,
      selections as string[],
      300,
      2
    )

    setGenLoading(true)
    setGenError(null)
    setGenImageUrl(null)
    setGenCaption(null)
    setGenLine(null)
    setGenBlurb(null)
    setGenPlaces([])
    setImgErrorPreview(false)

    try {
      console.debug('[gen] request body →', body)
      const res = await authedFetch('/gen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      console.debug('[gen] response ←', data)
      if (!res.ok) {
        throw new Error(data?.detail || `Hata: ${res.status}`)
      }
      if (data?.image_url) {
        let url = String(data.image_url)
        if (!url.startsWith('data:')) {
          url = ensureAbsUrl(url)
        }
        setGenImageUrl(url)
      } else {
        setGenImageUrl(null)
      }
      setGenCaption(data?.caption || null)
      setGenLine(data?.line || null)
      setGenBlurb(data?.blurb || null)
      setGenPlaces(Array.isArray(data?.items) ? data.items : [])
    } catch (e: any) {
      setGenError(e?.message || 'Bilinmeyen hata')
    } finally {
      setGenLoading(false)
    }
  }

  function spinWheel() {
    if (spinning) return
    setWheelResult(null)
    setSpinning(true)
    const extra = 360 * 4 + Math.floor(Math.random() * 360)
    setSpinAngle(prev => prev + extra)
    setTimeout(() => {
      const rnd = PERSONAS[Math.floor(Math.random() * PERSONAS.length)]
      setWheelResult(rnd)
      setSpinning(false)
      generateForPersona(rnd)
    }, 2200)
  }

  // --- UI ---
  return (
    <>
      <main className="min-h-screen bg-[#ECF0F1] px-6 py-16 lg:px-32 font-sans text-[#2C3E50]">
        {/* Header */}
        <header className="mb-12 text-center relative">
          <h1 className="text-5xl font-bold tracking-tight">YolYap</h1>
          <Link href="/profil" className="absolute top-0 right-0 mt-2 mr-2">
            <div className="w-10 h-10 bg-white border border-gray-300 rounded-full shadow flex items-center justify-center hover:bg-[#3498DB] transition">
              <span className="text-xl font-bold text-[#3498DB]">👤</span>
            </div>
          </Link>
          <button
            onClick={() => {
              if (!('geolocation' in navigator)) return alert('Tarayıcı konum desteği yok.')
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setUserLat(+pos.coords.latitude.toFixed(6))
                  setUserLon(+pos.coords.longitude.toFixed(6))
                  alert('Konum alındı')
                },
                (err) => alert('Konum alınamadı: ' + (err?.message || 'bilinmiyor')),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
              )
            }}
            className="absolute left-0 top-0 mt-2 ml-2 text-xs rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
            title="Konumumu kullan"
          >
            📍 Konumumu kullan
          </button>
        </header>

        {genImageUrl && (
          <section className="mb-8">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-4">
                {!imgErrorPreview ? (
                  <img
                    src={genImageUrl}
                    alt="Oluşturulan avatar"
                    className="w-24 h-24 object-cover rounded-xl border border-gray-200 shadow"
                    onError={() => setImgErrorPreview(true)}
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl border border-red-200 bg-red-50 text-red-600 grid place-items-center text-xs">
                    Yükleme başarısız
                  </div>
                )}
                <div className="min-w-0">
                  {genCaption && (
                    <div className="text-base font-semibold text-blue-900 truncate">{genCaption}</div>
                  )}
                  {cleanLine(genLine) && (
                    <div className="mt-1 text-[13px] leading-snug text-blue-900 bg-blue-50/80 border border-blue-200 rounded-md px-3 py-2 break-words">{cleanLine(genLine)}</div>
                  )}
                  {(parseNumbered(genBlurb).length > 0) ? (
                    <ol className="mt-2 text-[13px] text-gray-800 bg-gray-50/70 border border-gray-200 rounded-md px-3 py-2 space-y-0.5">
                      {parseNumbered(genBlurb).map((it, idx) => (
                        <li key={idx} className="leading-snug">{it}</li>
                      ))}
                    </ol>
                  ) : (genBlurb ? (
                    <div className="mt-2 text-[13px] text-gray-800 bg-gray-50/70 border border-gray-200 rounded-md px-3 py-2 break-words">{genBlurb}</div>
                  ) : null)}
                  {Array.isArray(genPlaces) && genPlaces.length > 0 && (
                    <ul className="mt-2 text-xs text-gray-700">
                      {genPlaces.filter(p => isVenueName(p.name)).slice(0,2).map((p, i) => (
                        <li key={`${p.name}-${i}`} className="flex justify-between py-0.5">
                          <span>📍 {p.name}</span>
                          <span className="text-[11px] text-gray-500">
                            {typeof p.distance_km === 'number' ? `${p.distance_km.toFixed(1)} km` : ''}
                            {p.tags && p.tags.length ? ` • ${p.tags.join(', ')}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!genCaption && !genLine && !genBlurb && (!genPlaces || genPlaces.length===0) && (
                    <div className="text-sm text-gray-600">AI görseli hazır.</div>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <a
                    href={genImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs rounded border border-gray-200 px-3 py-1 hover:bg-gray-50"
                    title="Yeni sekmede aç"
                  >
                    Yeni sekmede aç
                  </a>
                  <button
                    className="text-xs rounded border border-blue-200 text-blue-700 px-3 py-1 hover:bg-blue-50"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(genImageUrl!)
                        alert('Görsel bağlantısı kopyalandı!')
                      } catch {
                        alert('Kopyalanamadı, görsele sağ tıklayıp “Resim adresini kopyala”yı deneyin.')
                      }
                    }}
                  >
                    URL’yi kopyala
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Search + Map + List */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-6">
          {/* MAP */}
          <div className="relative h-[460px] md:h-[560px] rounded-2xl overflow-hidden border border-gray-200 shadow-md bg-white">
            {/* Floating search */}
            <div className="absolute z-[1200] right-4 top-4 flex items-center gap-2 pointer-events-auto max-w-md w-[80%]">
              <div className="flex-1 bg-white/95 backdrop-blur rounded-xl border border-gray-200 shadow px-3 py-2">
                <input
                  value={q}
                  onChange={(e)=>onType(e.target.value)}
                  onKeyDown={(e)=>{ if (e.key==='Enter' && suggests[0]) addFromSuggest(suggests[0]) }}
                  placeholder="Adres/konum ara…"
                  className="w-full outline-none text-sm"
                />
              </div>
              <button onClick={fitToAll} className="rounded-lg bg-white/95 border border-gray-200 shadow px-3 py-2 text-xs" title="Tüm noktaları sığdır">🔎 Sığdır</button>
            </div>

            {q && suggests.length > 0 && (
              <div className="absolute z-[1201] left-4 right-24 top-14 bg-white border border-gray-200 rounded-xl shadow max-h-64 overflow-auto pointer-events-auto">
                {suggests.map((s, i) => (
                  <button key={`${s.lat}-${s.lng}-${i}`} onClick={()=>addFromSuggest(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    {s.title}
                  </button>
                ))}
              </div>
            )}

            <div ref={mapEl} className="absolute inset-0 [min-height:460px]" aria-label="Harita" />
            <div className="absolute inset-x-0 bottom-3 flex items-center justify-between px-3 pointer-events-none">
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs text-gray-700 shadow">Tıkla → isim otomatik → listede birikir</span>
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs text-gray-700 shadow">{mapReady ? 'Mapbox tile aktif' : 'Harita yükleniyor…'}</span>
            </div>
          </div>

          {/* LIST */}
          <aside className="bg-white rounded-2xl border border-gray-200 shadow-md p-5 flex flex-col max-h-[560px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-gray-900">Seçilen Yerler</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">{selectedPlaces.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPickingStart(v=>!v)}
                  className={`h-8 w-8 inline-flex items-center justify-center rounded-md border transition ${isPickingStart ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                  title="Başlangıcı haritadan seç"
                >🧭</button>
                <button
                  onClick={()=>{
                    if (!navigator.geolocation) return alert('Tarayıcı konum desteği yok.')
                    navigator.geolocation.getCurrentPosition(
                      (pos)=>{ setStartMarkerId(null); setStartAnchor({ lat:+pos.coords.latitude.toFixed(6), lng:+pos.coords.longitude.toFixed(6) }); renumberMarkers(); alert('Başlangıç: mevcut konum') },
                      (err)=>alert('Konum alınamadı: '+err.message),
                      { enableHighAccuracy:true, timeout:8000 }
                    )
                  }}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:border-gray-300"
                  title="Konumumu başlangıç yap"
                >📍</button>
                <button onClick={clearAll} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300" title="Hepsini temizle">❌</button>
              </div>
            </div>

            <div className="flex-1 overflow-auto pr-1">
              {selectedPlaces.length === 0 ? (
                <p className="text-[13px] text-gray-600 mt-2">Haritaya tıkla veya üst kutudan ara → öneriden seç. Marker’lar sürüklenebilir.</p>
              ) : (
                <ul className="mt-3 divide-y">
                  {selectedPlaces.map((p) => (
                    <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 w-full">
                      <div className="min-w-0 max-w-full">
                        <input
                          value={p.name}
                          onChange={(e)=>{
                            const v=e.target.value
                            setSelectedPlaces(prev=>prev.map(x=>x.id===p.id?{...x,name:v}:x))
                            const m = markersRef.current[p.id]; if (m) m.bindPopup(`📍 ${v}`)
                          }}
                          className="w-full text-sm font-medium text-gray-900 bg-transparent outline-none"
                        />
                        <p className="truncate text-xs text-gray-500 font-mono">{p.lat}, {p.lng}</p>
                      </div>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <button
                          onClick={()=>{
                            // Tüm marker ikonlarını sıfırla
                            for (const mid of Object.keys(markersRef.current)) {
                              try { markersRef.current[mid].setIcon(defaultIconRef.current) } catch {}
                            }
                            // Bu yeri başlangıç olarak ata
                            const m = markersRef.current[p.id]; if (m) { try { m.setIcon(startIconRef.current) } catch {} }
                            setStartMarkerId(p.id); setStartAnchor({ lat:p.lat, lng:p.lng });

                            // Görsel sıra = gerçek sıra: seçilen yeri listenin başına taşı
                            setSelectedPlaces(prev => {
                              const idx = prev.findIndex(x => x.id === p.id)
                              if (idx <= 0) return prev
                              return [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)]
                            })

                              setTimeout(() => renumberMarkers(), 0)
                            }}
                          className="rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                        >Başlangıç</button>
                        <button onClick={()=>removePlace(p.id)} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Sil</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Süre & Aksiyon */}
            <div className="sticky bottom-0 pt-3 mt-3 bg-white">
              <div className="flex items-center gap-1.5 mb-2">
                {(['quick','slider','clock'] as const).map(m=>(
                  <button key={m} onClick={()=>setTimeMode(m)} className={`text-[11px] rounded-md px-2.5 py-1 border transition ${timeMode===m?'bg-indigo-600 border-indigo-600 text-white':'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                    {m==='quick'?'Hızlı':m==='slider'?'Kaydırıcı':'Saat'}
                  </button>
                ))}
              </div>

              {timeMode==='quick' && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {[30,60,90,120,180,240].map((m)=>(
                    <button key={m} onClick={()=>setTimeBudget(m)} className={`text-[11px] px-2.5 py-1 rounded-md border transition ${timeBudget===m?'bg-indigo-50 border-indigo-500 text-indigo-700':'border-gray-200 text-gray-800 hover:border-gray-300'}`}>
                      {m} dk
                    </button>
                  ))}
                  <div className="ml-auto text-xs text-gray-700">Seçili: <span className="font-medium">{timeBudget} dk</span></div>
                </div>
              )}

              {timeMode==='slider' && (
                <div className="mb-3">
                  <input type="range" min={15} max={360} step={5} value={timeBudget} onChange={(e)=>setTimeBudget(Number(e.target.value))} className="w-full" />
                  <div className="mt-1 text-xs text-gray-800">Seçili: <span className="font-medium">{timeBudget} dk</span></div>
                </div>
              )}

              {timeMode==='clock' && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="startT" className="text-xs text-gray-800">Başlangıç</label>
                    <input id="startT" type="time" step="60" value={startTime} onChange={(e)=>{ setStartTime(e.target.value); recomputeFromClock(e.target.value, endTime) }} onBlur={(e)=> recomputeFromClock(e.target.value, endTime)} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="endT" className="text-xs text-gray-800">Bitiş</label>
                    <input id="endT" type="time" step="60" value={endTime} onChange={(e)=>{ setEndTime(e.target.value); recomputeFromClock(startTime, e.target.value) }} onBlur={(e)=> recomputeFromClock(startTime, e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs" />
                  </div>
                  <div className="ml-auto text-xs text-gray-800">Süre: <span className="font-medium">{timeBudget} dk</span></div>
                </div>
              )}

              <div className="flex items-center gap-2 pb-2">
                <button
                  onClick={handleBuildRoute}
                  disabled={selectedPlaces.length === 0 || isPlanning}
                  className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[13px] shadow-sm transition ${selectedPlaces.length === 0 || isPlanning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {isPlanning ? 'Hesaplanıyor…' : 'Rota Oluştur'}
                </button>
                {routeInfo && (
                  <div className="ml-auto text-xs text-gray-800">
                    Toplam: <span className="font-medium">{((routeInfo.distanceMeters || 0)/1000).toFixed(1)} km</span> • Süre (trafik): <span className="font-medium">{routeInfo.duration || '-'}</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>

        {/* POPÜLER ROTALAR */}
        <section className="mt-16">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-2xl font-semibold mb-4">Popüler Rotalar</h3>
            <ul className="divide-y">
              {[
                { id: 'p1', title: 'Boğaz Hattı Mini Tur', minutes: 120, tags: ['sahil', 'yürüyüş', 'manzara'] },
                { id: 'p2', title: 'Tarihi Yarımada Hızlı Keşif', minutes: 150, tags: ['tarih', 'müze'] },
                { id: 'p3', title: 'Şehir Merkezi Kafe Rotası', minutes: 90, tags: ['kafe', 'rahat'] },
                { id: 'p4', title: 'Müze Sevenlere Öneri', minutes: 180, tags: ['müze'] },
              ].map((r) => (
                <li key={r.id} className="py-3 flex items-start gap-3">
                  <div className="mt-1 h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-inner flex items-center justify-center text-white text-xs">
                    🗺️
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{r.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">~{r.minutes} dk • {r.tags.join(' • ')}</p>
                  </div>
                  <Link
                    href={`/populer/${r.id}`}
                    className="shrink-0 text-xs rounded-full border border-gray-200 px-3 py-1 hover:border-[#2563EB] hover:text-[#2563EB] transition"
                  >
                    İncele
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* HERKES İÇİN KULLANIM */}
        <section className="mt-16">
          <h3 className="text-3xl font-bold text-center mb-8">🌐 Kolay Kullanım ve Herkes İçin Uygun</h3>
          <div className="grid gap-10 md:grid-cols-2">
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <h4 className="text-xl font-semibold mb-2">Sesli Komutlar</h4>
              <p className="text-gray-700">Uygulamaya konuşarak komut verebilirsin. "İstanbul'dan İzmir'e gidelim" dediğinde seni yönlendiririz.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <h4 className="text-xl font-semibold mb-2">Herkese Uygun Rotalar</h4>
              <p className="text-gray-700">Rampalı yollar, asansörlü binalar, herkese uygun mekanları dikkate alan rotalar sunarız.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <h4 className="text-xl font-semibold mb-2">Kişiselleştirilmiş Öneriler</h4>
              <p className="text-gray-700">Çarkı çevir, hangi rotaslistsin öğren ve öneri al!</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <h4 className="text-xl font-semibold mb-2">Uçak Bileti Desteği</h4>
              <p className="text-gray-700">Yakında YolYap üzerinden THY uçuşlarını görebilecek, sana uygun olanları kolayca seçebileceksin.</p>
            </div>
          </div>
        </section>

        <footer className="mt-24 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} YolYap — Seyahat Herkes İçindir
        </footer>
      </main>

      {/* 🎡 SABİT YUVARLAK BUTON — sağ üst kenarda, Rotalist'ten ayrı */}
      <button
        onClick={() => {
          setWheelOpen(true)
          setGenError(null)
          setGenCaption(null)
          setGenImageUrl(null)
          setGenLine(null)
        }}
        aria-label="Çarkı Çevir"
        title="Çarkı Çevir (Persona)"
        className="fixed top-24 right-6 z-[75] h-14 w-14 rounded-full bg-white border border-gray-200 shadow-lg hover:shadow-xl grid place-items-center"
      >
        <span className="text-2xl">🎡</span>
      </button>

      {/* Modal (büyüyen çark) */}
      <WheelModal
        open={wheelOpen}
        onClose={() => setWheelOpen(false)}
        spinning={spinning}
        spinAngle={spinAngle}
        onSpin={spinWheel}
        result={wheelResult}
        genLoading={genLoading}
        genError={genError}
        genImageUrl={genImageUrl}
        genCaption={genCaption}
        genLine={genLine}
        genBlurb={genBlurb}
        genPlaces={genPlaces}
      />

      {/* Rotalist Chat Floating (altta sağda) */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          aria-label="Harita Asistanı"
          title="Harita Asistanı"
          className="fixed bottom-6 right-6 z-[50] px-4 py-2 rounded-lg shadow-lg bg-[#3498DB] hover:bg-[#2D83BE] text-white flex items-center justify-center space-x-2"
        >
          <span>👀</span>
          <span>Rotalist</span>
        </button>
      )}
      {showChat && <ChatWidget onClose={() => setShowChat(false)} />}
    </>
  )
}
