'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { ReactNode } from 'react'

interface ShellProps {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  const pathname = usePathname()
  const { user, setUser } = useUser()

  const navigation = [
    { name: 'Mercados', href: '/markets' },
    { name: 'Marketplace', href: '/marketplace' },
    { name: 'Mis Posiciones', href: '/positions' },
  ]

  const adminNav = [{ name: 'Admin', href: '/admin' }]

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('wsm_user')
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex-shrink-0 flex items-center">
                <span className="text-xl font-bold text-blue-600">WIN</span>
                <span className="text-xl font-light text-gray-600 ml-1">Sports Market</span>
              </Link>

              {user && (
                <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        pathname.startsWith(item.href)
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {item.name}
                    </Link>
                  ))}
                  {user.role === 'ADMIN' &&
                    adminNav.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          pathname.startsWith(item.href)
                            ? 'bg-purple-50 text-purple-700'
                            : 'text-purple-600 hover:text-purple-900 hover:bg-purple-50'
                        }`}
                      >
                        {item.name}
                      </Link>
                    ))}
                </div>
              )}
            </div>

            {user && (
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">{user.username}</div>
                  <div className="text-sm text-green-600 font-semibold">${user.balance.toFixed(2)}</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Salir
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
