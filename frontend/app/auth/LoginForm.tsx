'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleLogin = () => {
    if (!email || !password) {
      setError('Lütfen tüm alanları doldurunuz.')
      return
    }
    setError('')
    setSuccess(true)

    setTimeout(() => {
      router.push('/home')
    }, 3000)
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