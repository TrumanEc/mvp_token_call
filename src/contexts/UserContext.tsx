'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

interface User {
  id: string
  username: string
  balance: number
  role: string
}

interface UserContextType {
  user: User | null
  setUser: (user: User | null) => void
  login: (username: string) => Promise<void>
  refreshBalance: () => Promise<void>
  loading: boolean
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedUser = localStorage.getItem('wsm_user')
    if (savedUser) {
      const parsed = JSON.parse(savedUser)
      login(parsed.username).catch(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (username: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/users/${username}`)
      if (!res.ok) throw new Error('User not found')
      const data = await res.json()
      const userData = { id: data.id, username: data.username, balance: data.balance, role: data.role }
      setUser(userData)
      localStorage.setItem('wsm_user', JSON.stringify(userData))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`/api/users/${user.username}`)
      if (res.ok) {
        const data = await res.json()
        setUser((prev) => prev ? { ...prev, balance: data.balance } : null)
        localStorage.setItem('wsm_user', JSON.stringify({ ...user, balance: data.balance }))
      }
    } catch {}
  }, [user])

  return (
    <UserContext.Provider value={{ user, setUser, login, refreshBalance, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) throw new Error('useUser must be used within UserProvider')
  return context
}
