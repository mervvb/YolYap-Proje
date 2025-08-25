'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

    // LoginForm.tsx (yalnızca handleLogin değişti)
  const handleLogin = async () => {
    if (!email || !password) {
      setError('Lütfen tüm alanları doldurunuz.')
      return
    }
    setError('')
    setSuccess(false)

    try {
      const base = process.env.NEXT_PUBLIC_BACKEND_URL || ''
      if (!base) throw new Error('BACKEND URL bulunamadı.')

      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.detail || 'Giriş başarısız.')
      }

      const data = await res.json()
      // Örn. token’ı localStorage’a yazabilirsin:
      // localStorage.setItem('token', data.access_token)

      setSuccess(true)
      setTimeout(() => router.push('/home'), 800)
    } catch (err: any) {
      setError(err.message || 'Beklenmeyen hata.')
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
