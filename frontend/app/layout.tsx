//Root layout. Tüm sayfalar için AuthProvider, QueryProvider, Navbar ve Toaster burada yüklenir.
import './globals.css'
import { ReactNode } from 'react'
import { AuthProvider } from './AuthProvider'
import QueryProvider from './QueryProvider'
import Navbar from '../components/Navbar'
import { Toaster } from 'react-hot-toast'


export const metadata = {
  title: 'Yolyap Smart Travel',
  description: 'Üretim Planlama & Rota Yönetim Sistemi',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          integrity="sha512-yHknUvy9zZmTEnD+C2DAvPCnKl+KcK7QZhxRcSUrfw3NpUeAS4u/MG1XZTyTPOzCAd3c2PqgxjZ+V0zDh9PeQ=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className={`min-h-dvh bg-neutral-50 text-neutral-900 antialiased`}>
        <QueryProvider>
          <AuthProvider>
            <Navbar />
            <Toaster position="top-right" />
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}