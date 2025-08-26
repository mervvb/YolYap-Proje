// frontend/components/WheelModal.tsx
'use client'

type Persona = { name: string; key: string; emoji: string; sample: string }

export default function WheelModal({
  open, onClose, spinning, spinAngle, onSpin, result,
  genLoading, genError, genImageUrl, genCaption, genLine,
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
}) {
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[2000] bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-[2100] inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 p-4 relative">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 text-gray-500 hover:text-gray-700 text-lg"
            aria-label="Kapat"
          >✖</button>

          <h3 className="text-xl font-semibold text-center">🎡 Çarkı Çevir — “Hangi Rotalistsin?”</h3>
          <p className="text-xs text-gray-600 text-center mt-1">
            Çevir → rastgele persona ve kişisel görsel/caption oluşturulur.
          </p>

          {/* Çark */}
          <div className="mt-6 grid place-items-center">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-red-600 drop-shadow" />
              </div>
              <div
                className="w-full h-full rounded-full border-8 border-indigo-200 grid place-items-center transition-transform"
                style={{
                  transform: `rotate(${spinAngle}deg)`,
                  transitionDuration: spinning ? '2200ms' : '300ms',
                  transitionTimingFunction: spinning ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'ease'
                }}
              >
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
                  <circle cx="50" cy="50" r="10" fill="#1d4ed8" />
                </svg>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={onSpin}
                disabled={spinning}
                className={`px-4 py-2 rounded-lg text-white shadow ${
                  spinning ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {spinning ? 'Dönüyor…' : 'Çevir'}
              </button>

              {result && (
                <div className="text-sm bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-md px-3 py-2">
                  {result.emoji} <b>{result.name}</b> — <code>{result.key}</code>
                </div>
              )}
            </div>
          </div>

          {/* Sonuç */}
          {result && (
            <div className="mt-6">
              {genLoading && (
                <div className="text-center text-blue-600 font-semibold">AI görsel oluşturuluyor…</div>
              )}
              {genError && (
                <div className="text-center mt-2">
                  <span className="inline-block bg-red-100 text-red-800 border border-red-200 px-3 py-1 rounded-md text-sm">{genError}</span>
                </div>
              )}
              {(genImageUrl || genCaption || genLine) && (
                <div className="mt-4 flex flex-col items-center">
                  {genImageUrl && (
                    <>
                      <img
                        src={genImageUrl}
                        alt="AI görsel"
                        className="w-full rounded-xl border border-gray-200 shadow-sm object-cover"
                        style={{ maxHeight: 280 }}
                      />
                      {/* Kopyalama butonu */}
                      <button
                        className="mt-2 text-xs px-3 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(genImageUrl)
                            alert('Görsel bağlantısı kopyalandı!')
                          } catch {
                            alert('Kopyalanamadı, görsele sağ tıklayıp “Resim adresini kopyala”yı deneyin.')
                          }
                        }}
                      >
                        Görsel URL’sini kopyala
                      </button>
                    </>
                  )}
                  {genCaption && (
                    <div className="mt-3 text-sm font-semibold text-blue-900">{genCaption}</div>
                  )}
                  {genLine && (
                    <div className="mt-1 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-center">
                      {genLine}
                    </div>
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
