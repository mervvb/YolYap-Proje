"use client";
import { useEffect, useState } from "react";
import axios from "axios";

type Pt = { lat: number; lng: number };

type Summary = {
  distanceKm: number;
  durationMin: number;
  withinBudget: boolean;
};

export default function MapPage() {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8080";

  // Durumlar
  const [hours, setHours] = useState<number>(4);
  const [places, setPlaces] = useState<Pt[]>([
    { lat: 41.0369, lng: 28.9861 }, // Taksim
    { lat: 41.0411, lng: 29.0039 }, // Beşiktaş
  ]);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const [newLat, setNewLat] = useState<string>("");
  const [newLng, setNewLng] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [result, setResult] = useState<string>("");
  const [order, setOrder] = useState<number[] | null>(null);

  // --- Nokta ekleme ---
  const addPoint = (lat?: number, lng?: number) => {
    const _lat = lat ?? Number(newLat);
    const _lng = lng ?? Number(newLng);
    if (!isFinite(_lat) || !isFinite(_lng)) {
      setError("Geçerli enlem/boylam girin (örn: 41.01, 29.00)");
      return;
    }
    setError(null);
    setPlaces((p) => [...p, { lat: _lat, lng: _lng }]);
    setNewLat("");
    setNewLng("");
  };

  const removePoint = (idx: number) => {
    setPlaces((prev) => prev.filter((_, i) => i !== idx));
    setOrder(null);
    if (anchorIndex === idx) setAnchorIndex(null);
    else if (anchorIndex !== null && idx < anchorIndex) setAnchorIndex(anchorIndex - 1);
  };

  const clearAll = () => {
    setPlaces([]);
    setOrder(null);
    setAnchorIndex(null);
    setSummary(null);
    setResult("");
    setError(null);
  };

  const selectAnchor = (idx: number) => setAnchorIndex(idx);

  // --- Harita/diğer UI parçalarından nokta eklemek için köprü ---
  useEffect(() => {
    // Global yardımcı: window.solviaAddPlace(lat, lng)
    (window as any).solviaAddPlace = (lat: number, lng: number) => {
      if (!isFinite(lat) || !isFinite(lng)) return;
      setPlaces((p) => [...p, { lat, lng }]);
    };

    // CustomEvent ile: new CustomEvent('solvia:add-place', { detail: { lat, lng } })
    const onAdd = (ev: Event) => {
      const e = ev as CustomEvent<{ lat: number; lng: number }>;
      const { lat, lng } = e.detail || ({} as any);
      if (!isFinite(lat) || !isFinite(lng)) return;
      setPlaces((p) => [...p, { lat, lng }]);
    };
    window.addEventListener("solvia:add-place", onAdd as EventListener);
    return () => window.removeEventListener("solvia:add-place", onAdd as EventListener);
  }, []);

  // --- Backend'den öneri al ---
  const suggest = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setResult("");
    setOrder(null);

    try {
      if (places.length < 2) {
        setError("En az 2 nokta gerekli");
        return;
      }

      const payload: any = {
        places,
        timeBudgetMin: Math.max(1, Math.round(hours)),
      };
      if (anchorIndex !== null && places[anchorIndex]) {
        payload.anchor = places[anchorIndex];
      }

      // Endpoint fallback: önce /plan, 404 gelirse /plan/plan
      const ep1 = `${base.replace(/\/$/, "")}/plan`;
      const ep2 = `${base.replace(/\/$/, "")}/plan/plan`;
      let data: any;
      try {
        const res1 = await axios.post(ep1, payload, { withCredentials: false });
        data = res1.data;
      } catch (e1: any) {
        if (e1?.response?.status === 404) {
          const res2 = await axios.post(ep2, payload, { withCredentials: false });
          data = res2.data;
        } else {
          throw e1;
        }
      }

      const durationSec = Number(data?.durationSec ?? data?.duration ?? 0);
      const distanceMeters = Number(data?.distanceMeters ?? data?.distance ?? 0);
      const withinBudget = Boolean(data?.withinBudget);

      setSummary({
        distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
        durationMin: Math.round(durationSec / 60),
        withinBudget,
      });

      const ord: number[] | undefined = data?.order;
      if (ord && ord.length) setOrder(ord);

      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      const status = e?.response?.status;
      const statusText = e?.response?.statusText;
      const url = e?.config?.url;
      const msg = e?.response?.data?.detail || e?.response?.data?.error || (status ? `${status} ${statusText || ''}`.trim() : e?.message) || "Beklenmeyen hata";
      setError(url ? `${msg} (URL: ${url})` : String(msg));
    } finally {
      setLoading(false);
    }
  };

  const orderedPlaces: Pt[] | null = order ? order.map((i) => places[i]).filter(Boolean) : null;

  return (
    <div style={{ padding: 16, maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Rota Önerisi (Trafik + Süre Kısıtı)</h1>
      <div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
        Backend: {base}
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "1fr 1fr",
          alignItems: "start",
        }}
      >
        {/* Sol panel: Nokta listesi ve ekleme */}
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Noktalar</div>

          {places.length === 0 && (
            <div style={{ color: "#6b7280", marginBottom: 8 }}>Henüz nokta yok. Aşağıdan ekleyin.</div>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {places.map((p, i) => (
              <li
                key={`${p.lat}-${p.lng}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: "1px dashed #e5e7eb",
                }}
              >
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {i + 1}. lat: {p.lat.toFixed(6)}, lng: {p.lng.toFixed(6)}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => selectAnchor(i)}
                    title="Başlangıç noktası yap"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: anchorIndex === i ? "2px solid #16a34a" : "1px solid #cbd5e1",
                      background: anchorIndex === i ? "#dcfce7" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {anchorIndex === i ? "Başlangıç" : "Başlat"}
                  </button>
                  <button
                    onClick={() => removePoint(i)}
                    title="Sil"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #ef4444",
                      background: "#fee2e2",
                      color: "#991b1b",
                      cursor: "pointer",
                    }}
                  >
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Ekleme alanı */}
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto", marginTop: 10 }}>
            <input
              placeholder="lat (örn 41.01)"
              value={newLat}
              onChange={(e) => setNewLat(e.target.value)}
              style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
              inputMode="decimal"
            />
            <input
              placeholder="lng (örn 29.00)"
              value={newLng}
              onChange={(e) => setNewLng(e.target.value)}
              style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
              inputMode="decimal"
            />
            <button
              onClick={() => addPoint()}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "#2563eb",
                color: "#fff",
                border: "1px solid #1d4ed8",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Ekle
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={clearAll}
              title="Tüm noktaları temizle"
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff" }}
            >
              Hepsini Temizle
            </button>
          </div>
        </div>

        {/* Sağ panel: Kısıt ve aksiyon */}
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Süre Kısıtı</div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Saat (1-24):</span>
            <input
              type="number"
              min={1}
              max={24}
              value={hours}
              onChange={(e) => setHours(Math.max(1, Math.min(24, Number(e.target.value))))}
              style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 8, maxWidth: 160 }}
            />
          </label>

          <button
            onClick={suggest}
            disabled={loading}
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #1d4ed8",
              background: loading ? "#93c5fd" : "#2563eb",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Hesaplanıyor..." : "Öneri Al"}
          </button>

          {error && (
            <div style={{ color: "#b91c1c", background: "#fee2e2", padding: 8, borderRadius: 8, marginTop: 12 }}>
              Hata: {error}
            </div>
          )}

          {summary && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, marginTop: 12 }}>
              <div><strong>Trafik dikkate alınmış süre:</strong> {summary.durationMin} dk</div>
              <div><strong>Toplam mesafe:</strong> {summary.distanceKm} km</div>
              <div>
                <strong>Bütçe:</strong> {summary.withinBudget ? "Uygun" : "Aşıldı"}
                {!summary.withinBudget && <span style={{ color: "#b91c1c" }}> (Süre kısıtı yetersiz)</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sıralı liste (order geldiyse) */}
      {order && order.length > 0 && (
        <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Optimize Edilmiş Sıra</div>
          <ol style={{ paddingLeft: 18 }}>
            {order.map((idx, k) => (
              <li key={`${idx}-${k}`}>
                {k + 1}. lat: {places[idx].lat.toFixed(6)}, lng: {places[idx].lng.toFixed(6)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Debug/JSON */}
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 12, background: "#0b1020", color: "#e6edf3", padding: 12, borderRadius: 8 }}>
        {result}
      </pre>
    </div>
  );
}
