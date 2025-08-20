'use client'

import { useState } from 'react'
import RegisterForm from './RegisterForm'
import LoginForm from './LoginForm'

export default function AuthPage() {
  const [mode, setMode] = useState<'register' | 'login'>('register')

  return (
    <div>
      {mode === 'register' ? (
        <RegisterForm onSwitch={() => setMode('login')} />
      ) : (
        <LoginForm onSwitch={() => setMode('register')} />
      )}
    </div>
  )
}