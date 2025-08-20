'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import Link from 'next/link'


const ChatWidget = dynamic(() => import('../../components/ChatWidget'), { ssr: false })

// ---- Backend base & helper ----
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080';
const apiFetch = (path: string, init?: RequestInit) =>
  fetch(`${API_BASE}${path}`, { mode: 'cors', ...init });

type Place = { id: string; name: string; lat: number; lng: number }

type LeafletNS = typeof import('leaflet')

export default function HomePage() {
  // --- STATE ---
  const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [timeBudget, setTimeBudget] = useState<number>(120) // dakika
  const [timeMode, setTimeMode] = useState<'quick' | 'slider' | 'clock'>('quick')
  const [startTime, setStartTime] = useState<string>('13:00')
  const [endTime, setEndTime] = useState<string>('15:00')
  const [isPlanning, setIsPlanning] = useState(false)
  const [startAnchor, setStartAnchor] = useState<{ lat: number; lng: number } | null>(null)
  const [startMarkerId, setStartMarkerId] = useState<string | null>(null)
  const [isPickingStart, setIsPickingStart] = useState(false)
  const startOnlyMarkerRef = useRef<any>(null)
  const isPickingStartRef = useRef(false)
  const pathname = usePathname()

  useEffect(() => { isPickingStartRef.current = isPickingStart }, [isPickingStart])

  // Leaflet DOM & instance refs (npm paketi eklemeden, CDN ile)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<Record<string, any>>({})
  const routeLineRef = useRef<any | null>(null)
  const defaultIconRef = useRef<any>(null)
  const startIconRef = useRef<any>(null)
  const [routeInfo, setRouteInfo] = useState<{ distanceMeters: number; duration: string } | null>(null)

  // --- Marker numaralandırma yardımcıları ---
  function makeNumberedIcon(n: number, isStart = false) {
    const L: any = (window as any).L
    if (!L) return null
    const color = isStart ? '#EF4444' : '#2563EB'
    return L.divIcon({
      className: 'numbered-marker',
      html: `
        <div style="position:relative;display:inline-block;">
          <div style="background:${color};width:20px;height:20px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></div>
          <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-58%);color:#fff;font-weight:700;font-size:11px;line-height:1;">${n}</div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })
  }

  function renumberMarkers() {
    const L: any = (window as any).L
    if (!L || !mapRef.current) return

    // 1) "Haritadan seçilen" özel başlangıç varsa — kırmızı #1 marker
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

  // 2) Listeden bir başlangıç seçilmişse — o ilk (#1 kırmızı), diğerleri 2..N
  const list = selectedPlaces.slice()
  if (startMarkerId) {
    const sIdx = list.findIndex((p) => p.id === startMarkerId)
    const visualOrder = sIdx >= 0
      ? [list[sIdx], ...list.slice(0, sIdx), ...list.slice(sIdx + 1)]
      : list

    visualOrder.forEach((p, i) => {
      const m = markersRef.current[p.id]
      if (!m) return
      // i=0 -> başlangıç, kırmızı #1; diğerler i+1
      const n = i === 0 ? 1 : i + 1
      try { m.setIcon(makeNumberedIcon(n, i === 0)) } catch {}
    })
    return
  }

  // 3) Hiç başlangıç yoksa: özel anchor varsa 2..N, yoksa 1..N hepsi mavi
  const base = hasCustomStart ? 2 : 1
  list.forEach((p, i) => {
    const m = markersRef.current[p.id]
    if (!m) return
    try { m.setIcon(makeNumberedIcon(base + i, false)) } catch {}
  })
}

  // --- Load Leaflet (CSS+JS) from CDN without installing packages ---
  useEffect(() => {
    let cancelled = false

    async function ensureLeafletLoaded(): Promise<LeafletNS | null> {
      // 1) CSS
      const cssId = 'leaflet-cdn-css'
      if (!document.getElementById(cssId)) {
        const link = document.createElement('link')
        link.id = cssId
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
        link.crossOrigin = ''
        document.head.appendChild(link)
        await new Promise<void>((resolve) => {
          link.onload = () => resolve();
          setTimeout(() => resolve(), 300);
        });
      }

      // 2) JSß
      const jsId = 'leaflet-cdn-js'
      if (!(window as any).L) {
        if (!document.getElementById(jsId)) {
          const script = document.createElement('script')
          script.id = jsId
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
          script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
          script.crossOrigin = ''
          document.body.appendChild(script)
          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Leaflet yüklenemedi'))
          })
        } else {
          // zaten ekli, yüklenmesini bekle
          await new Promise<void>((resolve) => setTimeout(resolve, 300))
        }
      }
      return (window as any).L || null
    }

    async function init() {
      try {
        const L = await ensureLeafletLoaded()
        if (!L || cancelled || !mapEl.current) return

        // Marker iconları: mavi (varsayılan) ve kırmızı (başlangıç)
        const defaultIcon = L.divIcon({
          className: 'custom-default-icon',
          html: '<div style="background:#2563EB;border-radius:50%;width:12px;height:12px;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.1)"></div>',
          iconSize: [12,12],
          iconAnchor: [6,6],
        })
        const startIcon = L.divIcon({
          className: 'custom-start-icon',
          html: '<div style="background:#EF4444;border-radius:50%;width:16px;height:16px;border:2px solid white;box-shadow:0 0 0 2px #EF4444"></div>',
          iconSize: [16,16],
          iconAnchor: [8,8],
        })
        defaultIconRef.current = defaultIcon
        startIconRef.current = startIcon

        // Avoid multiple initializations on Fast Refresh
        // @ts-ignore
        if (mapEl.current._leaflet_id) {
          try { (mapEl.current as any)._leaflet_id = null } catch {}
        }

        // Harita oluştur (İstanbul çevresi)
        mapRef.current = L.map(mapEl.current).setView([41.01, 29.00], 12)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
          tileSize: 256,
          keepBuffer: 2,
        }).addTo(mapRef.current)

        // Mapbox trafik (raster) overlay — token public
        const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        if (mapboxToken && typeof mapboxToken === 'string' && mapboxToken.length > 0) {
          try {
            const traffic = L.tileLayer(
              `https://api.mapbox.com/styles/v1/mapbox/traffic-day-v2/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
              {
                tileSize: 512,
                zoomOffset: -1,
                opacity: 0.9,
                attribution: '© Mapbox — Trafik verisi'
              }
            )
            traffic.addTo(mapRef.current)
          } catch (e) {
            console.warn('[Mapbox Traffic] Layer eklenemedi:', e)
          }
        } else {
          console.warn('[Mapbox Traffic] NEXT_PUBLIC_MAPBOX_TOKEN bulunamadı; trafik katmanı gösterilmeyecek.')
        }

        // Tıklama → yer ekle (seçilebilir harita)
        mapRef.current.on('click', (e: any) => {
          const picking = isPickingStartRef.current
          if (picking) {
            const { lat, lng } = e.latlng
            const a = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }

            // Manuel başlangıç (anchor) ayarla ve listedeki başlangıç seçimini sıfırla
            setStartMarkerId(null)
            setStartAnchor(a)
            setIsPickingStart(false)

            // Anında ekranda göster: kırmızı #1
            try {
              if (!startOnlyMarkerRef.current) {
                startOnlyMarkerRef.current = L.marker([a.lat, a.lng], {
                  icon: makeNumberedIcon(1, true),
                  zIndexOffset: 1000, // üstte kalsın
                }).addTo(mapRef.current)
              } else {
                startOnlyMarkerRef.current.setLatLng([a.lat, a.lng])
                startOnlyMarkerRef.current.setIcon(makeNumberedIcon(1, true))
                startOnlyMarkerRef.current.setZIndexOffset(1000)
              }
              mapRef.current.panTo([a.lat, a.lng]) // isteğe bağlı odak
            } catch {}

            // Diğer marker’ları 2..N numarala
            setTimeout(() => renumberMarkers(), 0)
            return
          }

          // Normal mod: tıklanan noktayı seçilen yerlere ekle
          const lat = e.latlng.lat as number
          const lng = e.latlng.lng as number
          const autoName = `Nokta (${lat.toFixed(4)}, ${lng.toFixed(4)})`

          const newPlace: Place = {
            id: crypto.randomUUID(),
            name: autoName,
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
          }
          setSelectedPlaces((prev) => [...prev, newPlace])

          // marker ekle (varsayılan: mavi)
          const marker = L.marker([newPlace.lat, newPlace.lng], { icon: defaultIconRef.current }).addTo(mapRef.current)
          marker.bindPopup(`📍 ${newPlace.name}`)
          // silindiğinde haritadan kaldırabilmek için referansı sakla
          markersRef.current[newPlace.id] = marker

          setTimeout(() => renumberMarkers(), 0)
        })

        setMapReady(true)
      } catch (err) {
        console.warn('[Map] Yüklenemedi:', err)
        setMapReady(false)
      }
    }

    void init()
    return () => {
      cancelled = true
      // harita örneğini kaldır (memory leak önleme)
      if (mapRef.current) {
        try { mapRef.current.remove() } catch {}
        mapRef.current = null
      }
    }
  }, [])

  function removePlace(id: string) {
    setSelectedPlaces((prev) => prev.filter((p) => p.id !== id))
    const marker = markersRef.current[id]
    if (marker) {
      try {
        if (mapRef.current && mapRef.current.removeLayer) {
          mapRef.current.removeLayer(marker)
        } else if (marker.remove) {
          marker.remove()
        }
      } catch {}
      delete markersRef.current[id]
    }
    // Eğer silinen başlangıç ise, başlangıcı sıfırla ve kalanları mavi yap
    if (startMarkerId === id) {
      setStartMarkerId(null)
      setStartAnchor(null)
      for (const mid of Object.keys(markersRef.current)) {
        try { markersRef.current[mid].setIcon(defaultIconRef.current) } catch {}
      }
    }
    renumberMarkers()
  }

  function clearAll() {
    // Tüm marker’ları kaldır
    try {
      const allMarkers = Object.values(markersRef.current || {}) as any[]
      for (const m of allMarkers) {
        try {
          if (mapRef.current && mapRef.current.removeLayer) {
            mapRef.current.removeLayer(m)
          } else if (m && typeof m.remove === 'function') {
            m.remove()
          }
        } catch {}
      }
    } catch {}
    // Marker referanslarını temizle
    markersRef.current = {}

    // Rota çizgisini kaldır
    if (routeLineRef.current) {
      try { mapRef.current?.removeLayer(routeLineRef.current) } catch {}
      routeLineRef.current = null
    }

    // Seçimler ve bilgi kartı
    setSelectedPlaces([])
    setRouteInfo(null)
    setStartAnchor(null)
    setStartMarkerId(null)
    if (startOnlyMarkerRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(startOnlyMarkerRef.current) } catch {}
      startOnlyMarkerRef.current = null
    }
    try { renumberMarkers() } catch {}
  }


  // Preflight helper for API reachability
  async function preflight() {
    // Backend health
    try {
      const r = await apiFetch('/health', { method: 'GET' });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return { ok: false, msg: `Backend hazır değil (status ${r.status}). Yanıt: ${t?.slice(0,180)}` };
      }
    } catch (e: any) {
      return { ok: false, msg: `Backend'e ulaşılamadı: ${String(e?.message || e)}` };
    }

    // Mapbox public token uyarısı (opsiyonel)
    // @ts-ignore
    const hasMb = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!hasMb) {
      console.warn('[Uyarı] NEXT_PUBLIC_MAPBOX_TOKEN tanımlı değil; trafik katmanı görünmeyebilir.');
    }
    return { ok: true, msg: 'OK' };
  }

  async function setAnchorFromGeolocation() {
    if (!navigator.geolocation) return alert('Tarayıcı konum desteği yok.')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const a = { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }
        setStartAnchor(a)
        alert('Başlangıç noktası konumunuza ayarlandı.')
      },
      (err) => alert('Konum alınamadı: ' + err.message),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  async function handleBuildRoute() {
    if (!mapRef.current) return alert('Harita hazır değil.')
    if (selectedPlaces.length < 2) return alert('En az 2 nokta seçin.')
    if (!startAnchor && !startMarkerId) {
      setIsPlanning(false)
      return alert('Lütfen başlangıç konumunu seçin: Listeden bir yer için "Başlangıç"a basın veya "Başlangıcı haritadan seç" ile haritada tıklayın.')
    }
    // Eğer POI başlangıcı seçiliyse ve anchor boşsa, anchor'ı senkronize et
    if (startMarkerId && !startAnchor) {
      const sp = selectedPlaces.find(s => s.id === startMarkerId)
      if (sp) setStartAnchor({ lat: sp.lat, lng: sp.lng })
    }
    // Liste snapshot – API'den dönen order bu sıraya göre indekslenir
    const listBefore = selectedPlaces.slice()

    setIsPlanning(true)

    // Preflight: API up?
    const pf = await preflight()
    if (!pf.ok) {
      setIsPlanning(false)
      return alert(pf.msg)
    }

    const places = listBefore.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    const timeBudgetMin = timeBudget

    let res: Response
    try {
      res = await apiFetch('/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ places, timeBudgetMin, anchor: startAnchor || null }),
      });
    } catch (e: any) {
      console.error('İstek atılamadı:', e)
      setIsPlanning(false)
      return alert(`İstek atılamadı. Ağ/servis hatası: ${String(e?.message || e)}`)
    }

    let raw = ''
    let data: any = null
    try { raw = await res.text() } catch {}

    if (!res.ok) {
      console.error('Planlama hatası (raw):', raw)
      setIsPlanning(false)
      // JSON ise error çıkar, değilse ham gövdeyi göster
      try { data = raw ? JSON.parse(raw) : null } catch {}
      const msg = data?.error || `Sunucu hatası (status ${res.status}).\n${raw?.slice(0,200)}`
      return alert(`Rota alınamadı: ${msg}`)
    }

    try { data = raw ? JSON.parse(raw) : {} } catch (e) {
      console.error('JSON parse hatası:', e, raw)
      setIsPlanning(false)
      return alert(`Beklenmedik yanıt (JSON değil). Sunucu cevabı: ${raw?.slice(0,200)}`)
    }

    // Listeyi en iyi sıraya göre güncelle (order, listBefore indekslerine göre)
    if (Array.isArray(data.order)) {
      let newOrder = data.order.map((idx: number) => listBefore[idx]).filter(Boolean)
      if (newOrder.length === listBefore.length) {
        // POI başlangıcı seçiliyse, sırayı döndür ki o ilk olsun
        if (startMarkerId) {
          const pos = newOrder.findIndex(p => p.id === startMarkerId)
          if (pos > 0) newOrder = [...newOrder.slice(pos), ...newOrder.slice(0, pos)]
        }
        setSelectedPlaces(newOrder)

        // Eğer kullanıcı haritadan özel başlangıç (anchor) seçtiyse, onu #1 olarak koru.
        // Anchor yoksa, ilk POI'yi başlangıç kabul et.
        if (startAnchor) {
          // Liste 2..N olarak numaralanacak; anchor kırmızı #1 kalır
          setStartMarkerId(null)
        } else if (newOrder[0]) {
          setStartMarkerId(newOrder[0].id)
          setStartAnchor({ lat: newOrder[0].lat, lng: newOrder[0].lng })
        }

        // Marker ikonlarını yeni sıraya göre 1..N (veya anchor varsa 2..N) numaralandır
        setTimeout(() => renumberMarkers(), 0)
      }
    }

    // Eski polyline’ı kaldır
    if (routeLineRef.current) {
      try { mapRef.current.removeLayer(routeLineRef.current) } catch {}
      routeLineRef.current = null
    }

    // Geometriyi çiz
    const L: any = (window as any).L
    const coords = data?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length === 0) {
      setIsPlanning(false)
      return alert('Rota geometrisi alınamadı.')
    }
    const latlngs = coords.map((c: [number, number]) => [c[1], c[0]])
    const line = L.polyline(latlngs, { color: '#2563EB', weight: 5, opacity: 0.85 }).addTo(mapRef.current)
    routeLineRef.current = line
    mapRef.current.fitBounds(line.getBounds())

    const warn = data?.withinBudget === false ? '⚠ Seçilen süreye sığmıyor' : undefined
    const durationSec = Number(data?.durationSec ?? data?.duration ?? 0);
    const distanceMeters = Number(data?.distanceMeters ?? data?.distance ?? 0);
    setRouteInfo({
      distanceMeters,
      duration: `${Math.round(durationSec / 60)} dk` + (warn ? ` • ${warn}` : ''),
    });

    setIsPlanning(false)
  }

  // clock modunda HH:MM -> dakika hesapla
  function recomputeFromClock(a: string, b: string) {
    if (!a || !b) return
    const [ah, am] = a.split(':').map(Number)
    const [bh, bm] = b.split(':').map(Number)
    if ([ah, am, bh, bm].some((n) => Number.isNaN(n))) return
    let minutes = (bh * 60 + bm) - (ah * 60 + am)
    if (minutes < 0) minutes += 24 * 60 // ertesi güne taşma
    setTimeBudget(minutes)
  }

  // Saat modunda başlangıç/bitiş değiştikçe süreyi otomatik hesapla
  useEffect(() => {
    if (timeMode === 'clock') {
      recomputeFromClock(startTime, endTime)
    }
  }, [timeMode, startTime, endTime])

  // --- UI ---
  return (
    <>
      <main className="min-h-screen bg-[#ECF0F1] px-6 py-16 lg:px-32 font-sans text-[#2C3E50]">
        {/* Header - DOKUNMA */}
        <header className="mb-12 text-center relative">
          <h1 className="text-5xl font-bold tracking-tight">YolYap</h1>
          <Link href="/profil">
            <div className="absolute top-0 right-0 mt-2 mr-2 group cursor-pointer">
              <div className="w-10 h-10 bg-white border border-gray-300 rounded-full shadow flex items-center justify-center hover:bg-[#3498DB] transition">
                <span className="text-xl font-bold text-[#3498DB] group-hover:text-white">👤</span>
              </div>
              <span className="text-xs text-gray-600 mt-1 group-hover:opacity-100 opacity-0 transition absolute top-12 right-1 bg-white px-2 py-1 rounded shadow">
                Profil
              </span>
            </div>
          </Link>
        </header>

        {/* MAP + SELECTED LIST  */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-6 relative">
          {/* MAP AREA */}
          <div className="relative h-[420px] md:h-[520px] rounded-2xl overflow-hidden border border-gray-200 shadow-md bg-white">
            {/* Gerçek harita container (Leaflet CDN ile) */}
            <div ref={mapEl} className="absolute inset-0 [min-height:420px]" aria-label="Harita" />

            {/* Üst bilgi */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pointer-events-none">
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs text-gray-700 shadow">
                Haritaya tıkla → isim ver → listede birikir
              </span>
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs text-gray-700 shadow">
                {mapReady ? 'Seçilebilir harita aktif' : 'Harita yükleniyor…'}
              </span>
            </div>
          </div>

          {/* SELECTED PLACES LIST */}
          <aside className="bg-white rounded-2xl border border-gray-200 shadow-md p-5 flex flex-col max-h-[520px]">
            {/* Header / Toolbar (minimal) */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-gray-900">Seçilen Yerler</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">{selectedPlaces.length}</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Başlangıcı haritadan seç */}
                <div className="relative group">
                  <button
                    onClick={() => setIsPickingStart(v => !v)}
                    className={`h-8 w-8 inline-flex items-center justify-center rounded-md border transition ${
                      isPickingStart ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                    aria-label="Başlangıcı haritadan seç"
                    title="Başlangıcı haritadan seç"
                  >
                    🧭
                  </button>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] bg-gray-900 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition z-[100] shadow">
                    Başlangıcı haritadan seç
                  </span>
                </div>

                {/* Konumumu başlangıç yap */}
                <div className="relative group">
                  <button
                    onClick={setAnchorFromGeolocation}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:border-gray-300 transition"
                    aria-label="Konumumu başlangıç yap"
                    title="Konumumu başlangıç yap"
                  >
                    📍
                  </button>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] bg-gray-900 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition z-[100] shadow">
                    Konumumu başlangıç yap
                  </span>
                </div>

                {/* Hepsini temizle */}
                <div className="relative group">
                  <button
                    onClick={clearAll}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 transition"
                    aria-label="Hepsini temizle"
                    title="Hepsini temizle"
                  >
                    ❌
                  </button>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] bg-gray-900 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition z-[100] shadow">
                    Hepsini temizle
                  </span>
                </div>
              </div>
            </div>

            {/* Boşsa bilgi metni, doluysa liste */}
            <div className="flex-1 overflow-auto pr-1">
              {selectedPlaces.length === 0 ? (
                <p className="text-[13px] text-gray-600 mt-2">
                  Henüz yer eklemedin. Haritaya tıklayarak yer eklemeye başlayabilirsin. Seçilen her yer burada birikir ve yanında <span className="font-medium">Sil</span> butonu olur.
                </p>
              ) : (
                <ul className="mt-3 divide-y">
                  {selectedPlaces.map((p, i) => (
                    <li
                      key={p.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 w-full"
                    >
                      {/* Sol kolon: metin (tek satır, kırpma) */}
                      <div className="min-w-0 max-w-full">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {i + 1}. {p.name}
                        </p>
                        <p className="truncate text-xs text-gray-500 font-mono">
                          {p.lat}, {p.lng}
                        </p>
                      </div>

                      {/* Sağ kolon: butonlar (sarmasın) */}
                      <div className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                        <button
                          onClick={() => {
                            // tüm marker'ları mavi yap
                            for (const mid of Object.keys(markersRef.current)) {
                              try { markersRef.current[mid].setIcon(defaultIconRef.current) } catch {}
                            }
                            // seçilen marker'ı kırmızı yap
                            const m = markersRef.current[p.id]
                            if (m) { try { m.setIcon(startIconRef.current) } catch {} }
                            setStartMarkerId(p.id)
                            setStartAnchor({ lat: p.lat, lng: p.lng })
                            renumberMarkers()
                          }}
                          className="rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                          title="Bu noktayı başlangıç yap"
                        >
                          Başlangıç
                        </button>
                        <button
                          onClick={() => removePlace(p.id)}
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          title="Bu noktayı sil"
                        >
                          Sil
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Süre & Aksiyonlar — en altta sabit */}
            <div className="sticky bottom-0 pt-3 mt-3 bg-white">
              {/* Mod sekmeleri */}
              <div className="flex items-center gap-1.5 mb-2">
                {(['quick','slider','clock'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTimeMode(m)}
                    className={`text-[11px] rounded-md px-2.5 py-1 border transition ${
                      timeMode===m ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {m==='quick'?'Hızlı':m==='slider'?'Kaydırıcı':'Saat'}
                  </button>
                ))}
              </div>

              {/* QUICK: Hazır süre çipleri */}
              {timeMode === 'quick' && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {[30, 60, 90, 120, 180, 240].map((m) => (
                    <button
                      key={m}
                      onClick={() => setTimeBudget(m)}
                      className={`text-[11px] px-2.5 py-1 rounded-md border transition ${
                        timeBudget===m ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-gray-200 text-gray-800 hover:border-gray-300'
                      }`}
                    >
                      {m} dk
                    </button>
                  ))}
                  <div className="ml-auto text-xs text-gray-700">Seçili: <span className="font-medium">{timeBudget} dk</span></div>
                </div>
              )}

              {/* SLIDER: 15–360 dk */}
              {timeMode === 'slider' && (
                <div className="mb-3">
                  <input
                    type="range"
                    min={15}
                    max={360}
                    step={5}
                    value={timeBudget}
                    onChange={(e) => setTimeBudget(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="mt-1 text-xs text-gray-800">Seçili: <span className="font-medium">{timeBudget} dk</span></div>
                </div>
              )}

              {/* CLOCK: Başlangıç/Bitiş seçimi */}
              {timeMode === 'clock' && (
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

              {/* Aksiyon butonları */}
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

        {/* POPÜLER ROTALAR — aşağıda sıralı liste */}
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

        {/* HERKES İÇİN KULLANIM — dokunma isteği vardı, bırakıyoruz */}
        <section className="mt-16">
          <h3 className="text-3xl font-bold text-center mb-8">🌐 Kolay Kullanım ve Herkes İçin Uygun</h3>
          <div className="grid gap-10 md:grid-cols-2">
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <h4 className="text-xl font-semibold mb-2">Sesli Komutlar</h4>
              <p className="text-gray-700">Uygulamaya konuşarak komut verebilirsin. "İstanbul'dan İzmir'e gidelim" dediğinde seni yönlendiririz.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <h4 className="text-xl font-semibold mb-2">Herkese Uygun Rotalar</h4>
              <p className="text-gray-700">Rampalı yollar, asansörlü binalar, engelli bireylere uygun mekanları dikkate alan rotalar sunarız.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-md">
              <h4 className="text-xl font-semibold mb-2">Kişisel Görünüm Seçenekleri</h4>
              <p className="text-gray-700">Yazı büyüklüğünü ve ekran kontrastını kendine göre ayarlayabilirsin. Dilersen titreşimle uyarılar da alabilirsin.</p>
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

    {/* Floating Chat Button (outside map) */}
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

    {/* ChatWidget renders fixed; no extra container to avoid white background */}
    {showChat && (
      <ChatWidget onClose={() => setShowChat(false)} />
    )}
    </>
  )
}