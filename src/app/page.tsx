'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'

function LoginPage() {
  const router = useRouter()
  const { user, login, loading } = useUser()
  const [users, setUsers] = useState<{ id: string; username: string; balance: number; role: string }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => {
    if (user && !loading) {
      router.push('/markets')
    }
  }, [user, loading, router])

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoadingUsers(false))
  }, [])

  const handleLogin = async (username: string) => {
    await login(username)
    router.push('/markets')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold mb-2">
          <span className="text-blue-600">WIN</span>
          <span className="text-gray-700"> Sports Market</span>
        </h1>
        <p className="text-xl text-gray-600">Mercado P2P de Predicciones Deportivas</p>
      </div>

      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">Selecciona tu Usuario</h2>

          {loadingUsers ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No hay usuarios. Ejecuta el seed primero.</p>
              <code className="block mt-2 text-sm bg-gray-100 p-2 rounded">npm run db:seed</code>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleLogin(u.username)}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  <div className="text-left">
                    <div className="font-medium text-gray-900">{u.username}</div>
                    <div className="text-sm text-gray-500">{u.role === 'ADMIN' ? '👑 Admin' : '👤 Usuario'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green-600">${u.balance.toFixed(2)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-sm text-gray-500">
        MVP v1.0 — Predicciones de Transferencias
      </p>
    </div>
  )
}

export default function Home() {
  return (
    <UserProvider>
      <LoginPage />
    </UserProvider>
  )
}
