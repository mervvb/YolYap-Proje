// utils/iconUtils.tsx
// Leaflet için numaralı (1,2,3...) ikon üreten yardımcı fonksiyonlar

import L from 'leaflet'

export type NumberedIconOptions = {
  size?: number               // piksel (genişlik=yükseklik)
  startColor?: string         // başlangıç noktası arka plan rengi
  color?: string              // diğer noktaların arka plan rengi
  textColor?: string          // rakam rengi
  className?: string          // ekstra sınıf eklemek için
  anchorCenter?: boolean      // true ise merkezden; false ise alt-orta
}

/**
 * Leaflet DivIcon döndürür. Başlangıç noktası için kırmızı, diğerleri mavi varsayılan.
 */
export function makeNumberedIcon(
  number: number,
  isStart: boolean = false,
  opts: NumberedIconOptions = {}
): L.DivIcon {
  const size = Math.max(18, Math.min(48, opts.size ?? 24))
  const bg = isStart ? (opts.startColor ?? '#DC2626') : (opts.color ?? '#2563EB') // red-600 / blue-600
  const text = opts.textColor ?? '#FFFFFF'
  const className = `custom-number-icon ${opts.className ?? ''}`.trim()

  // Merkezden mi, iğne alt-ortadan mı sabitleyelim?
  const iconAnchor: [number, number] = opts.anchorCenter
    ? [size / 2, size / 2]
    : [size / 2, size] // alt-orta

  // Güvenli rakam
  const label = Number.isFinite(number) ? String(number) : ''

  const html = `
    <div
      aria-label="marker-${label}"
      style="
        display:flex;align-items:center;justify-content:center;
        width:${size}px;height:${size}px;
        background:${bg};color:${text};
        border-radius:50%;
        box-shadow:0 4px 10px rgba(0,0,0,0.25);
        font-weight:600;font-size:${Math.round(size * 0.5)}px;
        line-height:1; user-select:none;
        border:2px solid rgba(255,255,255,0.85);
      "
    >${label}</div>`

  return L.divIcon({
    className,
    html,
    iconSize: [size, size],
    iconAnchor,
  })
}

// Kısayollar
export const makeStartIcon = (num: number, opts?: Omit<NumberedIconOptions, 'startColor'|'color'>) =>
  makeNumberedIcon(num, true, opts)

export const makeStepIcon = (num: number, opts?: Omit<NumberedIconOptions, 'startColor'>) =>
  makeNumberedIcon(num, false, opts)