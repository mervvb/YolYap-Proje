//Üst menü. Kullanıcı email, plan (Free/Premium) ve logout butonları. Premium’a geç linki.
'use client'

// Update the import path below if AuthProvider is located elsewhere, e.g. '@/providers/AuthProvider' or '../app/AuthProvider'
import { useAuth } from '../app/AuthProvider'
// Update the import path below to the correct relative path where useLogout is defined
import { useLogout } from '../hooks/useLogout'

export default function Navbar() {
  const { user, buyPremium } = useAuth()
  const logout = useLogout()

  return (
    <header className="flex justify-between items-center p-2 border-b bg-white text-gray-800 shadow-sm">
      <div
        className="font-sans text-xs md:text-sm font-normal text-gray-600"
      >
        YolYap ile Seyahatini Şekillendir — Akıllı, Kişisel, Zahmetsiz
      </div>

      {user && (
        <div className="flex gap-4 items-center">
          <span className="bg-white/10 px-3 py-1 rounded-lg shadow-inner text-sm text-gray-700 flex items-center">
            {user.email}
            <span
              className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                user.plan === 'premium'
                  ? 'bg-emerald-400/10 text-emerald-600 ring-emerald-300/30'
                  : 'bg-sky-400/10 text-sky-700 ring-sky-300/30'
              }`}
            >
              {user.plan === 'premium' ? 'Premium' : 'Free'}
            </span>
          </span>
          {user.plan === 'free' && (
            <button
              onClick={buyPremium}
              className="px-3 py-1 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 text-zinc-900 font-medium shadow hover:from-amber-300 hover:to-yellow-400 transition"
            >
              Premium'a Geç
            </button>
          )}
          <button
            onClick={logout}
            className="border border-gray-300 rounded-lg px-3 py-1 text-gray-700 font-normal hover:bg-gray-100 transition"
          >
            Çıkış Yap
          </button>
        </div>
      )}
    </header>
  )
}