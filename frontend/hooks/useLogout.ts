//Logout işlemi için özel hook. Logout sonrası anasayfaya yönlendirir.
'use client'

import { useAuth } from '../app/AuthProvider'
import { useRouter } from 'next/navigation'

export function useLogout() {
  const { logout } = useAuth()
  const router = useRouter()

  return async () => {
    await logout()
    router.replace('/')
    router.refresh()
  }
}