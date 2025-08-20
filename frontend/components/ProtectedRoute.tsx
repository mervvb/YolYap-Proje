// Sayfa yetkilendirmesi. Gerekli role/roller göre kullanıcıyı yönlendirir.
'use client'

import { useAuth } from '../app/AuthProvider'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type RoleProp = string | string[] | undefined

export default function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode
  role?: RoleProp
}) {
  const { accessToken, user } = useAuth()
  const router = useRouter()
  const [redirecting, setRedirecting] = useState(false)

  const hasRequiredRole = useMemo(() => {
    if (!role) return true
    if (!user?.role) return false
    const roles = Array.isArray(role) ? role : [role]
    return roles.includes(user.role)
  }, [role, user?.role])

  useEffect(() => {
    // Yetkisiz durumlarda yönlendir ve UI flash'ı engelle
    if (!accessToken) {
      setRedirecting(true)
      router.replace('/unauthorized')
      return
    }
    if (!hasRequiredRole) {
      setRedirecting(true)
      router.replace('/unauthorized')
      return
    }
  }, [accessToken, hasRequiredRole, router])

  // Yönlendirme sürecinde içerik göstermeyelim
  if (redirecting) return null

  return <>{children}</>
}