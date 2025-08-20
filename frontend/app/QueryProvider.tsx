// React Query ayarları. Global cache ve API çağrıları için context sağlar.
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { PropsWithChildren } from 'react'

// Devtools'u sadece ihtiyaç olduğunda yüklemek için dinamik import.
// Bu bileşen, render edilmediği sürece bundle'a dahil olmaz.
const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools),
  { ssr: false }
)

// .env.local içine ekleyerek devreye al:
// NEXT_PUBLIC_SHOW_RQ_DEVTOOLS=true
const SHOW_DEVTOOLS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_SHOW_RQ_DEVTOOLS === 'true'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Hata alınca en fazla 1 kez denesin
      refetchOnWindowFocus: false, // Sekmeye dönünce tekrar fetch etmesin
      staleTime: 1000 * 60, // 1 dk boyunca cache’i taze kabul etsin
    },
  },
})

export default function QueryProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Devtools varsayılan olarak kapalı. Sadece flag true ise göster. */}
      
    </QueryClientProvider>
  )
}