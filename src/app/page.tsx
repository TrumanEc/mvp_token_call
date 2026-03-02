import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function Home() {
  const session = await auth()

  if (session) {
    redirect("/markets")
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden flex flex-col items-center justify-center p-6 text-center">
      {/* Background Glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-emerald-600/10 rounded-full blur-[150px] pointer-events-none animate-pulse"></div>

      <div className="relative z-10 max-w-3xl">
        <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tighter bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
          WIN SPORTS MARKET
        </h1>
        
        <p className="text-xl md:text-2xl text-zinc-400 mb-10 font-medium max-w-2xl mx-auto leading-relaxed">
          The next generation of P2P prediction markets for global sports transfers. 
          Trade tokens, predict outcomes, and win big.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/login"
            className="px-10 py-5 bg-[#64c883] text-[#0a0a0a] font-bold rounded-2xl text-lg transition-all hover:bg-[#5aaf75] hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(100,200,131,0.2)]"
          >
            Start Trading
          </Link>
          <button 
            className="px-10 py-5 bg-zinc-900 text-white font-bold rounded-2xl text-lg border border-white/10 transition-all hover:bg-zinc-800 hover:border-white/20 active:scale-[0.98]"
          >
            How it works
          </button>
        </div>

        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-white/5 pt-10 text-zinc-500 uppercase tracking-widest text-xs font-bold">
          <div>
            <div className="text-white text-xl mb-1">$42M+</div>
            Volume
          </div>
          <div>
            <div className="text-white text-xl mb-1">12.5K</div>
            Active Traders
          </div>
          <div>
            <div className="text-white text-xl mb-1">LIVE</div>
            Transfer Window
          </div>
          <div>
            <div className="text-white text-xl mb-1">P2P</div>
            Architecture
          </div>
        </div>
      </div>

      <footer className="absolute bottom-10 left-0 right-0 text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-medium pointer-events-none">
        Internal Alpha — Build 0.1.0-revC
      </footer>
    </div>
  )
}
