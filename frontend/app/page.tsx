// /app/page.tsx
"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(to bottom right, #1e3a8a, #2563eb)",
        position: "relative",
        padding: 24,
      }}
    >
      <div
        style={{
          position: "relative",
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(12px)",
          borderRadius: 16,
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          padding: 40,
          maxWidth: 720,
          width: "100%",
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <h1
          style={{
            fontSize: 48,
            marginBottom: 16,
            fontWeight: "bold",
            color: "#1e3a8a",
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
          }}
        >
          YolYap
        </h1>
        <p
          style={{
            color: "#475569",
            fontSize: 18,
            marginBottom: 32,
          }}
        >
          Trafik ve süre kısıtı dikkate alınmış rota planlayıcı.
        </p>

        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/auth"
            style={{
              padding: "14px 28px",
              borderRadius: 9999,
              backgroundColor: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              textDecoration: "none",
              transition: "background-color 0.3s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#1d4ed8")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#2563eb")
            }
          >
            Kayıt Ol
          </Link>
        
        </div>
      </div>
    </main>
  );
}
