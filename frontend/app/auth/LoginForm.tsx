// frontend/app/auth/LoginForm.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Normalize backend base to avoid localhost/127.0.0.1 mismatch
function normalizeBackendBase(raw: string): string {
  try {
    const u = new URL(raw);
    if (typeof window !== 'undefined') {
      const currentHost = window.location.hostname; // e.g. 'localhost' or '127.0.0.1'
      // Keep port & protocol, just align hostname to current host so SameSite cookie kuralları bozulmasın.
      if ((u.hostname === '127.0.0.1' && currentHost === 'localhost') ||
          (u.hostname === 'localhost' && currentHost === '127.0.0.1')) {
        u.hostname = currentHost;
      }
    }
    return u.origin;
  } catch {
    return raw;
  }
}

export default function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Lütfen tüm alanları doldurunuz.')
      return
    }
    setError('')
    setSuccess(false)

    // make base visible in catch/logs
    let base = ''
    try {
      const rawBase = process.env.NEXT_PUBLIC_BACKEND_URL || ''
      base = normalizeBackendBase(rawBase)
      if (!base) throw new Error('BACKEND URL bulunamadı.')

      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.detail || 'Giriş başarısız.')
      }

      // Başarılı giriş — cookie set edildi.
      setSuccess(true)

      // İsteğe bağlı: girişin gerçekten oturduğunu doğrulamak için /auth/me çağrısı yap.
      try {
        await fetch(`${base}/auth/me`, { credentials: 'include', cache: 'no-store' })
      } catch {}

      // Persona sayfasına yönlendir
      setTimeout(() => router.push('/persona'), 400)
    } catch (err: any) {
      console.warn('[Login] error with base:', base, err);
      setError(err?.message || 'Beklenmeyen hata.')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 relative bg-cover bg-center" style={{
        backgroundColor: '#1e293b',
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.75)), url('/background.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}>
      
      <div className="relative p-10 rounded-xl shadow-lg border border-gray-300 w-full max-w-md bg-white bg-opacity-90">
        <h1 className="text-3xl font-extrabold text-center text-blue-900 mb-6 tracking-wide">Giriş Yap</h1>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="border border-gray-300 rounded-md p-3 mb-4 w-full focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition text-black"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Şifre"
          className="border border-gray-300 rounded-md p-3 mb-4 w-full focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition text-black"
        />

        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-2">Giriş başarılı! Yönlendiriliyorsunuz...</p>}

        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors duration-300 font-semibold"
        >
          Giriş Yap
        </button>

        <p className="text-sm mt-6 text-center text-black">
          Hesabınız yok mu?{' '}
          <button onClick={onSwitch} className="text-blue-700 hover:text-blue-900 underline transition font-sans">
            Kayıt Ol
          </button>
        </p>
      </div>
    </main>
  )
}
