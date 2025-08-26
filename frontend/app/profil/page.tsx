'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ProfilPage() {
  // --- Sadece UI demoları (backend bağlanınca kaldır/bağla) ---
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [language, setLanguage] = useState<'tr' | 'en'>('tr')
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light')

  const [twoFA, setTwoFA] = useState(false)
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')

  const [plan, setPlan] = useState<'free' | 'premium'>('free')
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [notifyPush, setNotifyPush] = useState(false)

  const [saving, setSaving] = useState<null | string>(null)

  const router = useRouter()

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      })
    } catch (e) {
      console.error('Logout failed', e)
    } finally {
      router.push('/auth')
    }
  }

  const fakeSave = async (section: string) => {
    setSaving(section)
    await new Promise((r) => setTimeout(r, 600))
    setSaving(null)
    alert(`${section}: Taslak kaydedildi (backend eklenecek).`)
  }

  return (
    <main className="min-h-screen bg-[#ECF0F1] px-6 py-12 lg:px-32 font-sans text-[#2C3E50]">
      {/* Üst bar */}
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Profil & Ayarlar</h1>
        <Link href="/home" className="text-sm text-[#2563EB] hover:underline">← Haritaya Dön</Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 👤 PROFİL BİLGİLERİ */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-4">👤 Profil Bilgileri</h2>
          <div className="grid gap-3">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Ad Soyad</span>
              <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="Ad Soyad" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">E-posta</span>
              <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="ornek@mail.com" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Telefon</span>
              <input value={phone} onChange={(e)=>setPhone(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" placeholder="05xx xxx xx xx" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Dil</span>
                <select value={language} onChange={(e)=>setLanguage(e.target.value as any)} className="w-full rounded-md border border-gray-300 px-3 py-2">
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-gray-700 mb-1">Tema</span>
                <select value={theme} onChange={(e)=>setTheme(e.target.value as any)} className="w-full rounded-md border border-gray-300 px-3 py-2">
                  <option value="light">Açık</option>
                  <option value="dark">Koyu</option>
                  <option value="system">Sistem</option>
                </select>
              </label>
            </div>

            <div className="pt-2 text-right">
              <button onClick={() => fakeSave('Profil Bilgileri')} disabled={!!saving} className={`px-4 py-2 rounded-md text-white ${saving? 'bg-gray-400' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'} `}>Kaydet</button>
            </div>
          </div>
        </section>

        {/* 🔒 GÜVENLİK */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-4">🔒 Güvenlik</h2>
          <div className="grid gap-3">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Mevcut Şifre</span>
              <input type="password" value={oldPass} onChange={(e)=>setOldPass(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Yeni Şifre</span>
              <input type="password" value={newPass} onChange={(e)=>setNewPass(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>

            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={twoFA} onChange={(e)=>setTwoFA(e.target.checked)} />
              <span>İki Adımlı Doğrulama (2FA)</span>
            </label>

            <div className="pt-2 text-right">
              <button onClick={() => fakeSave('Güvenlik')} disabled={!!saving} className={`px-4 py-2 rounded-md text-white ${saving? 'bg-gray-400' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'} `}>Güncelle</button>
            </div>
          </div>
        </section>

        {/* 📦 ABONELİK/PLAN */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-4">📦 Plan & Abonelik</h2>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 text-sm">
              <span>Mevcut Plan:</span>
              <span className={`px-2 py-1 rounded-full text-xs ${plan==='premium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{plan.toUpperCase()}</span>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={()=>setPlan('free')} className={`px-3 py-1 rounded-md border ${plan==='free'?'border-[#2563EB] text-[#2563EB]':'border-gray-300 text-gray-700 hover:border-[#2563EB]'}`}>Free</button>
              <button onClick={()=>setPlan('premium')} className={`px-3 py-1 rounded-md border ${plan==='premium'?'border-[#2563EB] text-[#2563EB]':'border-gray-300 text-gray-700 hover:border-[#2563EB]'}`}>Premium</button>
            </div>       
            <div className="pt-2 text-right">
              <button onClick={() => fakeSave('Abonelik')} disabled={!!saving} className={`px-4 py-2 rounded-md text-white ${saving? 'bg-gray-400' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'} `}>Kaydet</button>
            </div>
          </div>
        </section>

        {/* ⚙️ UYGULAMA AYARLARI */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-4">⚙️ Uygulama Ayarları</h2>
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notifyEmail} onChange={(e)=>setNotifyEmail(e.target.checked)} />
              <span>E-posta bildirimleri</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notifyPush} onChange={(e)=>setNotifyPush(e.target.checked)} />
              <span>Push bildirimleri</span>
            </label>
            

            <div className="pt-2 text-right">
              <button onClick={() => fakeSave('Uygulama Ayarları')} disabled={!!saving} className={`px-4 py-2 rounded-md text-white ${saving? 'bg-gray-400' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'} `}>Kaydet</button>
            </div>
          </div>
        </section>

        {/* 🛑 HESAP İŞLEMLERİ */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-4">🛑 Hesap Yönetimi</h2>
          <div className="grid gap-3 text-sm">
            <button onClick={handleLogout} className="justify-self-start rounded-md border border-gray-300 px-3 py-1 hover:border-[#2563EB]">Oturumu Kapat</button>
            <button className="justify-self-start rounded-md border border-yellow-300 px-3 py-1 text-yellow-700 hover:bg-yellow-50">Hesabı Dondur</button>
            <button className="justify-self-start rounded-md border border-red-300 px-3 py-1 text-red-600 hover:bg-red-50">Hesabı Sil</button>           
          </div>
        </section>
      </div>

      <footer className="mt-16 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} YolYap — Profil ve Ayarlar
      </footer>
    </main>
  )
}
