'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleRegister = () => {
    if (!name || !email || !password || !confirmPassword) {
      setError('Lütfen tüm alanları doldurunuz.')
      return
    }
    if (password !== confirmPassword) {
      setError('Şifreler uyuşmuyor.')
      return
    }
    setError('')
    setSuccess(true)

    setTimeout(() => {
      router.push('/giris')
    }, 1500)
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 font-sans"
      style={{
        backgroundColor: '#1e293b',
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.75)), url('/background.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="relative z-10 p-10 rounded-2xl shadow-2xl w-full max-w-md bg-white/90 backdrop-blur-md">
        <h1 className="text-4xl font-extrabold text-center text-blue-900 mb-6 tracking-tight drop-shadow-md font-sans">Kayıt Ol</h1>

        {/* Form Fields */}
        <div className="space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ad Soyad"
            className="border border-gray-300 rounded-md p-3 mb-4 w-full focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition text-black"
          />
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
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type="password"
            placeholder="Şifre Tekrar"
            className="border border-gray-300 rounded-md p-3 mb-4 w-full focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition text-black"
          />
        </div>

        {error && <p className="text-red-700 text-base mt-3 mb-1 text-center font-medium drop-shadow-sm font-sans">{error}</p>}
        {success && <p className="text-green-700 text-base mt-3 mb-1 text-center font-medium drop-shadow-sm font-sans">Kayıt başarılı! Giriş yapabilirsiniz.</p>}

        <button
          onClick={handleRegister}
          className="w-full mt-4 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white py-4 rounded-lg font-medium text-base shadow-lg transition duration-200 drop-shadow-md font-sans"
        >
          Kayıt Ol
        </button>

        <p className="text-sm mt-6 text-center text-gray-800 drop-shadow-sm font-sans">
          Zaten hesabınız var mı?{' '}
          <button onClick={onSwitch} className="text-blue-700 hover:text-blue-900 underline transition font-sans">Giriş Yap</button>
        </p>

        {/* Social Media Section */}
        <div className="mt-8">
          <div className="text-center text-gray-800 text-sm mb-2 font-sans">Bizi sosyal medyada takip edin:</div>
          <div className="flex justify-center gap-6">
            <a
              href="https://instagram.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:scale-110 transition flex items-center justify-center"
              aria-label="Instagram"
            >
              <img src="/instagram.png" alt="Instagram" width="28" height="28" />
            </a>
            <a
              href="https://facebook.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:scale-110 transition flex items-center justify-center"
              aria-label="Facebook"
            >
              <img src="/facebook.png" alt="Facebook" width="28" height="28" />
            </a>
            <a
              href="https://x.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:scale-110 transition flex items-center justify-center"
              aria-label="X"
            >
              <img src="/x.jpg" alt="X (formerly Twitter)" width="28" height="28" />
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}