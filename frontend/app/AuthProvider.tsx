//JWT access/refresh token yönetimi. Token süresi bitince yeniler. Stripe Checkout entegrasyonu içerir.
'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'
import { jwtDecode } from 'jwt-decode'
import axios, { AxiosRequestHeaders } from 'axios'
import toast from 'react-hot-toast'

interface User {
  email: string
  role: string
  plan: string
  [key: string]: any
}

interface AuthContextType {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  buyPremium: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

  useEffect(() => {
    const access = localStorage.getItem('access_token')
    const refresh = localStorage.getItem('refresh_token')
    if (access) setAccessToken(access)
    if (refresh) setRefreshToken(refresh)
  }, [])

  useEffect(() => {
    if (!accessToken) {
      setUser(null)
      return
    }
    try {
      const decoded: any = jwtDecode(accessToken)
      setUser({
        email: decoded.email,
        role: decoded.role,
        plan: decoded.plan,
        ...decoded,
      })

      const expTime = decoded.exp * 1000
      const now = Date.now()
      const buffer = 60_000
      const delay = Math.max(1_000, expTime - now - buffer) // en az 1sn
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        refresh()
      }, delay)
    } catch {
      // bozuk/eksik token -> temizle
      logout()
    }
  }, [accessToken])

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const res = await axios.post<{ access_token: string; refresh_token: string }>(
      `${backendUrl}/login`,
      new URLSearchParams({ username: email, password })
    )
    const { access_token, refresh_token } = res.data
    if (access_token && refresh_token) {
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      setAccessToken(access_token)
      setRefreshToken(refresh_token)
      toast.success('Giriş başarılı!')
    } else {
      throw new Error('Giriş başarısız.')
    }
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setAccessToken(null)
    setRefreshToken(null)
    setUser(null)
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }

  const refresh = async () => {
    if (!refreshToken) {
      logout()
      return
    }
    const res = await axios.post<{ access_token: string }>(`${backendUrl}/refresh`, { refresh_token: refreshToken })
    const { access_token } = res.data
    if (access_token) {
      localStorage.setItem('access_token', access_token)
      setAccessToken(access_token)
    } else {
      logout()
    }
  }
  const buyPremium = async () => {
    if (!accessToken) return
    const res = await axios.post(`${backendUrl}/create-checkout-session`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const url = (res.data as { checkout_url?: string })?.checkout_url
    if (!url) {
      throw new Error('checkout_url gelmedi')
    }
    window.location.href = url
  }

  useEffect(() => {
    const req = axios.interceptors.request.use((config) => {
      if (!config.headers) {
        config.headers = {} as AxiosRequestHeaders
      }
      if (accessToken) {
        (config.headers as AxiosRequestHeaders).Authorization = `Bearer ${accessToken}`
      }
      return config
    })

    const res = axios.interceptors.response.use(
      (res) => res,
      async (error) => {
        const cfg = error.config || {}
        if (error.response?.status === 401 && !cfg.__isRetried) {
          try {
            await refresh()
            cfg.__isRetried = true
            return axios(cfg)
          } catch {
            logout()
          }
        }
        return Promise.reject(error)
      }
    )

    return () => {
      axios.interceptors.request.eject(req)
      axios.interceptors.response.eject(res)
    }
  }, [accessToken, refreshToken])

  return (
    <AuthContext.Provider value={{ accessToken, refreshToken, user, login, logout, buyPremium }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}