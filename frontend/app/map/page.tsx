"use client";
import { useState } from "react";
import axios from "axios";

export default function MapPage() {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";

  // Demo alanları
  const [hours, setHours] = useState(4); // süre kısıtı (saat cinsinden) -> backend'e timeBudgetMin olarak gider
  const [result, setResult] = useState("");
  const [summary, setSummary] = useState<{ distanceKm: number; durationMin: number; withinBudget: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basit demo: 2 nokta (trafik etkisi backend'de Mapbox driving-traffic ile hesaplanır)
  const demoPlaces = [
    { lat: 41.0369, lng: 28.9861 }, // Taksim
    { lat: 41.0411, lng: 29.0039 }, // Beşiktaş
  ];

  const suggest = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setResult("");

    try {
      const { data } = await axios.post(`${base}/plan`, {
        places: demoPlaces,
        timeBudgetMin: hours, // ⟵ süre kısıtını backend'e gönderiyoruz
        // anchor: { lat: ..., lng: ... } // başlangıç noktası seçileceğinde ekleyebilirsin
      }, { withCredentials: false });

      // Beklenen backend çıktısı:
      // {
      //   order: number[],
      //   durationSec: number,
      //   distanceMeters: number,
      //   geometry: {...},
      //   withinBudget: boolean,
      //   costFromMatrixSec: number,
      //   startIndexResolved: number
      // }

      const durationSec = Number(data?.durationSec ?? data?.duration ?? 0);
      const distanceMeters = Number(data?.distanceMeters ?? data?.distance ?? 0);
      const withinBudget = Boolean(data?.withinBudget);

      setSummary({
        distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
        durationMin: Math.round(durationSec / 60),
        withinBudget,
      });

      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Beklenmeyen hata";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Rota Önerisi (Trafik + Süre Kısıtı)</h1>

      <div style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Süre Kısıtı (saat):</span>
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Number(e.target.value)))}
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </label>

        <button
          onClick={suggest}
          disabled={loading}
          style={{
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
          <div style={{ color: "#b91c1c", background: "#fee2e2", padding: 8, borderRadius: 8 }}>
            Hata: {error}
          </div>
        )}

        {summary && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
            <div><strong>Trafik dikkate alınmış süre:</strong> {summary.durationMin} dk</div>
            <div><strong>Toplam mesafe:</strong> {summary.distanceKm} km</div>
            <div>
              <strong>Bütçe:</strong> {summary.withinBudget ? "Uygun" : "Aşıldı"}
              {!summary.withinBudget && <span style={{ color: "#b91c1c" }}> (Süre kısıtı yetersiz)</span>}
            </div>
          </div>
        )}
      </div>

      <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{result}</pre>
    </div>
  );
}