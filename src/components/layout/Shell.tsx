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
    <div className="min-h-screen bg-[#0a0a0a]">
      <nav className="bg-[#0a0a0a] border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/markets" className="flex-shrink-0 flex items-center mr-8">
                <span className="text-xl font-extrabold text-[#64c883] tracking-tighter">WIN</span>
                <span className="text-[10px] font-bold text-gray-400 ml-2 uppercase tracking-wider hidden md:block">Market</span>
              </Link>

              {user && (
                <div className="hidden sm:flex h-full">
                  {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`relative h-full flex items-center px-4 text-[11px] font-bold uppercase tracking-[0.1em] transition-all ${
                          isActive
                            ? 'text-[#64c883]'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {item.name}
                        {isActive && (
                          <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#64c883] rounded-full shadow-[0_0_8px_rgba(100,200,131,0.4)]" />
                        )}
                      </Link>
                    )
                  })}
                  {user.role === 'ADMIN' &&
                    adminNav.map((item) => {
                      const isActive = pathname.startsWith(item.href)
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`relative h-full flex items-center px-4 text-[11px] font-bold uppercase tracking-[0.1em] transition-all ${
                          isActive
                            ? 'text-white'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {item.name}
                        {isActive && (
                          <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                        )}
                      </Link>
                      )
                    })}
                </div>
              )}
            </div>

            {user && (
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Balance</div>
                  <div className="text-base font-extrabold text-white leading-none tracking-tight">
                    $ {user.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                
                <div className="h-8 w-[1px] bg-white/5" />

                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-white tracking-tight">@{user.username}</span>
                    <button
                      onClick={handleLogout}
                      className="text-[9px] font-bold text-gray-400 hover:text-[#e16464] uppercase tracking-wider transition-colors"
                    >
                      Cerrar Sesión
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-6">{children}</main>
    </div>
  )
}
