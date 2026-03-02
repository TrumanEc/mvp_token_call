import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface User {
  id: string
  name: string | null
  username: string | null
  email?: string | null
  balance: number
  role: string
}

interface UserContextType {
  user: User | null
  setUser: (user: User | null) => void
  login: (username: string) => Promise<void>
  createUser: (username: string, email?: string) => Promise<boolean>
  refreshBalance: () => Promise<void>
  loading: boolean
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshBalance = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`/api/users/${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setUser((prev) => prev ? { ...prev, balance: data.balance } : null)
      }
    } catch {}
  }, [user])

  useEffect(() => {
    if (status === 'loading') return

    if (session?.user) {
      const fetchUser = async () => {
        try {
          const res = await fetch(`/api/users/${session.user.id}`)
          if (res.ok) {
            const data = await res.json()
            setUser({
              id: data.id,
              name: data.name,
              username: data.username,
              email: data.email,
              balance: data.balance,
              role: data.role
            })
          }
        } finally {
          setLoading(false)
        }
      }
      fetchUser()
    } else {
      setUser(null)
      setLoading(false)
    }
  }, [session, status])

  const createUser = useCallback(async (username: string, email?: string) => {
    // This is now handled by NextAuth, but we keep the type for compatibility if needed
    return true
  }, [])

  const login = useCallback(async (username: string) => {
    // This is now handled by NextAuth
  }, [])

  return (
    <UserContext.Provider value={{ user, setUser, login, createUser, refreshBalance, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) throw new Error('useUser must be used within UserProvider')
  return context
}
