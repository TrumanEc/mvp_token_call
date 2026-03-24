"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/contexts/UserContext";
import { ReactNode, useState } from "react";
import { signOut } from "next-auth/react";

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: "Mercados", href: "/markets" },
    { name: "Mis Posiciones", href: "/positions" },
  ];

  const adminNav = [{ name: "Admin", href: "/admin" }];

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <nav className="bg-[#0a0a0a] border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link
                href="/markets"
                className="flex-shrink-0 flex items-center mr-8"
              >
                <span className="text-xl font-extrabold text-[#64c883] tracking-tighter">
                  WIN
                </span>
                <span className="text-[10px] font-bold text-gray-400 ml-2 uppercase tracking-wider hidden md:block">
                  Market
                </span>
              </Link>

              {user && (
                <div className="hidden sm:flex h-full">
                  {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`relative h-full flex items-center px-4 text-[11px] font-bold uppercase tracking-[0.1em] transition-all ${
                          isActive
                            ? "text-[#64c883]"
                            : "text-white/60 hover:text-white"
                        }`}
                      >
                        {item.name}
                        {isActive && (
                          <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#64c883] rounded-full shadow-[0_0_8px_rgba(100,200,131,0.4)]" />
                        )}
                      </Link>
                    );
                  })}
                  {user.role === "ADMIN" &&
                    adminNav.map((item) => {
                      const isActive = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`relative h-full flex items-center px-4 text-[11px] font-bold uppercase tracking-[0.1em] transition-all ${
                            isActive
                              ? "text-white"
                              : "text-white/60 hover:text-white"
                          }`}
                        >
                          {item.name}
                          {isActive && (
                            <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                          )}
                        </Link>
                      );
                    })}
                </div>
              )}
            </div>

            {user && (
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="text-right">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    Balance
                  </div>
                  <div className="text-sm sm:text-base font-extrabold text-white leading-none tracking-tight">
                    ${" "}
                    {user.balance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>

                <div className="h-8 w-[1px] bg-white/5 hidden sm:block" />

                <div className="hidden sm:flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-white tracking-tight">
                      {user.username
                        ? `@${user.username}`
                        : user.email?.split("@")[0] || "Usuario"}
                    </span>
                    <button
                      onClick={handleLogout}
                      className="text-[9px] font-bold text-gray-400 hover:text-[#e16464] uppercase tracking-wider transition-colors"
                    >
                      Cerrar Sesión
                    </button>
                  </div>
                </div>

                <div className="sm:hidden flex items-center border-l border-white/10 pl-4 h-10">
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  >
                    <span className="sr-only">Toggle menu</span>
                    {isMobileMenuOpen ? (
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 6h16M4 12h16m-7 6h7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu, show/hide based on menu state. */}
        {user && isMobileMenuOpen && (
          <div className="sm:hidden border-t border-white/5 bg-[#0a0a0a] px-4 py-4 space-y-4 shadow-xl">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
              <div className="text-left">
                <div className="text-[12px] font-bold text-white tracking-tight">
                  {user.username
                    ? `@${user.username}`
                    : user.email?.split("@")[0] || "Usuario"}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <button
                  onClick={handleLogout}
                  className="text-[10px] bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20 font-bold text-red-400 hover:text-red-300 hover:bg-red-500/20 uppercase tracking-wider transition-colors"
                >
                  Cerrar Sesión
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block py-3 px-4 rounded-lg text-[13px] font-bold uppercase tracking-[0.1em] transition-all ${
                      isActive
                        ? "bg-[#64c883]/10 text-[#64c883] border border-[#64c883]/20"
                        : "text-white/70 hover:bg-white/5 hover:text-white border border-transparent"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
              {user.role === "ADMIN" &&
                adminNav.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`block py-3 px-4 rounded-lg text-[13px] font-bold uppercase tracking-[0.1em] transition-all ${
                        isActive
                          ? "bg-white/10 text-white border border-white/20"
                          : "text-white/70 hover:bg-white/5 hover:text-white border border-transparent"
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto py-2 px-2">{children}</main>
    </div>
  );
}
