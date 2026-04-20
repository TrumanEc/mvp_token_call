"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/Shell";
import { Modal } from "@/components/ui/Modal";
import { PriceChart } from "@/components/markets/PriceChart";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { LmsrCalculator } from "./lmsr-calculator";

function AdminPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "markets" | "users" | "purchases" | "payments" | "simulator" | "router_logs" | "inactive"
  >("markets");
  const [inactiveMarkets, setInactiveMarkets] = useState<any[]>([]);
  const [loadingInactive, setLoadingInactive] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [routerLogs, setRouterLogs] = useState<any[]>([]);
  const [loadingRouterLogs, setLoadingRouterLogs] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", email: "" });
  const [selectedMarketId, setSelectedMarketId] = useState<string>("");

  const [selectedUserStats, setSelectedUserStats] = useState<any>(null);
  const [selectedMarketStats, setSelectedMarketStats] = useState<any>(null);
  const [lmsrLogs, setLmsrLogs] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [newMarket, setNewMarket] = useState({
    playerName: "",
    question: "",
    description: "",
    resolutionDate: "",
    maxPool: "",
    b: "100",
    maxBetAmount: "",
    maxPriceImpact: "",
    initialProbabilityYes: "50",
  });

  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) {
      router.push("/");
    }
  }, [user, loading, router]);

  const fetchMarkets = () => {
    setLoadingMarkets(true);
    fetch("/api/markets")
      .then((r) => r.json())
      .then(setMarkets)
      .catch(() => {})
      .finally(() => setLoadingMarkets(false));
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchPurchases = async (marketId?: string) => {
    setLoadingPurchases(true);
    try {
      const url = marketId
        ? `/api/admin/purchases?marketId=${marketId}`
        : "/api/admin/purchases";
      const res = await fetch(url);
      const data = await res.json();
      setPurchases(data);
    } finally {
      setLoadingPurchases(false);
    }
  };

  const fetchTransactions = async (marketId?: string) => {
    setLoadingTransactions(true);
    try {
      const url = marketId
        ? `/api/admin/transactions?marketId=${marketId}`
        : "/api/admin/transactions";
      const res = await fetch(url);
      const data = await res.json();
      setTransactions(data);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const fetchRouterLogs = async (marketId?: string) => {
    setLoadingRouterLogs(true);
    try {
      const url = marketId
        ? `/api/admin/router-logs?marketId=${marketId}`
        : "/api/admin/router-logs";
      const res = await fetch(url);
      const data = await res.json();
      setRouterLogs(data);
    } finally {
      setLoadingRouterLogs(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/stats`);
      const data = await res.json();
      setSelectedUserStats(data);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchMarketDetails = async (marketId: string) => {
    setSelectedMarketId(marketId);
    setLoadingDetails(true);
    setLoadingLogs(true);
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetch(`/api/admin/markets/${marketId}/stats`),
        fetch(`/api/admin/markets/${marketId}/lmsr-logs`),
      ]);

      const statsData = await statsRes.json();
      const logsData = await logsRes.json();

      if (statsData.error) {
        console.error("Error fetching market stats:", statsData.error);
        return;
      }

      setSelectedMarketStats(statsData);
      setLmsrLogs(logsData);
    } finally {
      setLoadingDetails(false);
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchMarkets();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (activeTab === "purchases") fetchPurchases(selectedMarketId);
    if (activeTab === "payments") fetchTransactions(selectedMarketId);
    if (activeTab === "router_logs") fetchRouterLogs(selectedMarketId);
    if (activeTab === "inactive") fetchInactiveMarkets();
  }, [activeTab, selectedMarketId]);

  const fetchInactiveMarkets = async () => {
    setLoadingInactive(true);
    try {
      const res = await fetch("/api/admin/inactive-markets?minDays=0");
      const data = await res.json();
      setInactiveMarkets(data);
    } finally {
      setLoadingInactive(false);
    }
  };

  const handleRecoverSeed = async (marketId: string) => {
    if (!confirm("¿Recuperar seed de este mercado inactivo? El mercado quedará VOIDED.")) return;
    setRecoveringId(marketId);
    try {
      const res = await fetch("/api/admin/inactive-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchInactiveMarkets();
        fetchMarkets();
      } else {
        alert(`Error: ${data.error}`);
      }
    } finally {
      setRecoveringId(null);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newMarket,
          maxPool: newMarket.maxPool
            ? parseFloat(newMarket.maxPool)
            : undefined,
          b: parseFloat(newMarket.b) || 100,
          maxBetAmount: newMarket.maxBetAmount
            ? parseFloat(newMarket.maxBetAmount)
            : undefined,
          maxPriceImpact: newMarket.maxPriceImpact
            ? parseFloat(newMarket.maxPriceImpact)
            : undefined,
          initialProbabilityYes: parseFloat(newMarket.initialProbabilityYes) / 100 || 0.5,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewMarket({
          playerName: "",
          question: "",
          description: "",
          resolutionDate: "",
          maxPool: "",
          b: "100",
          maxBetAmount: "",
          maxPriceImpact: "",
          initialProbabilityYes: "50",
        });
        fetchMarkets();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (id: string) => {
    await fetch(`/api/markets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    fetchMarkets();
  };

  const handleResolve = async (outcome: "YES" | "NO" | "VOID") => {
    setResolving(true);
    try {
      await fetch(`/api/markets/${showResolveModal.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      setShowResolveModal(null);
      fetchMarkets();
      if (activeTab === "payments") fetchTransactions(selectedMarketId);
    } finally {
      setResolving(false);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error toggling role:", error);
      alert("Error técnico al cambiar el rol. Revisa la consola del servidor.");
    }
  };

  const handleCreateUser = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (res.ok) {
        setShowCreateUserModal(false);
        setNewUser({ username: "", email: "" });
        fetchUsers();
      }
    } finally {
      setCreating(false);
    }
  };

  if (loading || !user || user.role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#64c883]" />
      </div>
    );
  }

  return (
    <Shell>
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-6">
        {/* Admin Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <div>
            <h1 className="text-[32px] md:text-[40px] font-bold text-white leading-tight mb-2">
              Panel Admin
            </h1>
            <div className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.1em] text-white/40">
              Control de Plataforma
            </div>
          </div>

          <div className="flex overflow-x-auto bg-[#121212] p-1 rounded-xl border border-white/5">
            {[
              { id: "markets", label: "Mercados" },
              { id: "users", label: "Usuarios" },
              { id: "purchases", label: "Compras" },
              { id: "payments", label: "Pagos" },
              { id: "router_logs", label: "Router" },
              { id: "simulator", label: "Simulador" },
              { id: "inactive", label: "Sin Actividad" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSelectedMarketId("");
                }}
                className={`flex-shrink-0 whitespace-nowrap px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${
                  activeTab === tab.id
                    ? "bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/10"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-[#121212] p-4 rounded-2xl border border-white/5">
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-white">
            {activeTab === "markets"
              ? "Gestión de Mercados"
              : activeTab === "users"
                ? "Gestión de Usuarios"
                : activeTab === "purchases"
                  ? "Historial de Compras"
                  : activeTab === "payments"
                    ? "Historial de Pagos"
                    : activeTab === "router_logs"
                      ? "Auditoría Híbrida (Best Buy Router)"
                      : "Simulador LMSR"}
          </h2>
          <div className="flex items-center gap-4">
            {(activeTab === "purchases" ||
              activeTab === "payments" ||
              activeTab === "router_logs") && (
              <select
                className="bg-[#0a0a0a] text-white text-[10px] font-bold uppercase tracking-[0.1em] px-4 py-2 border border-white/5 rounded-xl outline-none focus:border-[#64c883] transition-all"
                value={selectedMarketId}
                onChange={(e) => setSelectedMarketId(e.target.value)}
              >
                <option value="">Filtro: Todos</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.playerName || m.question.substring(0, 20)}
                  </option>
                ))}
              </select>
            )}
            {activeTab === "markets" && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-[#64c883] text-[#0a0a0a] text-[10px] font-bold uppercase tracking-[0.1em] px-5 py-2 rounded-xl transition-all hover:scale-[1.02]"
              >
                + Crear Mercado
              </button>
            )}
            {activeTab === "users" && (
              <button
                onClick={() => setShowCreateUserModal(true)}
                className="bg-white text-[#0a0a0a] text-[10px] font-bold uppercase tracking-[0.1em] px-5 py-2 rounded-xl transition-all hover:scale-[1.02]"
              >
                + Crear Usuario
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="space-y-6">
          {activeTab === "simulator" && (
            <div className="max-w-3xl mx-auto">
              <LmsrCalculator />
            </div>
          )}

          {activeTab === "inactive" && (
            <div className="space-y-4">
              <div className="bg-[#121212] border border-yellow-500/20 rounded-2xl p-4 text-[11px] text-yellow-400">
                Mercados sin actividad (sin posiciones). Podés recuperar el seed voidando el mercado.
              </div>
              {loadingInactive ? (
                <div className="flex justify-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" />
                </div>
              ) : inactiveMarkets.length === 0 ? (
                <div className="text-center py-20 text-gray-500 text-sm">
                  No hay mercados inactivos
                </div>
              ) : (
                <div className="space-y-3">
                  {inactiveMarkets.map((m) => (
                    <div
                      key={m.id}
                      className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5 flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">{m.question}</p>
                        <div className="flex gap-4 mt-1 text-[10px] text-gray-400 uppercase tracking-wider">
                          <span>{m.status}</span>
                          <span>{m.daysSinceCreation} días abierto</span>
                          <span className="text-yellow-400">Seed: ${Number(m.seedCost).toFixed(2)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRecoverSeed(m.id)}
                        disabled={recoveringId === m.id}
                        className="shrink-0 h-10 px-4 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[10px] font-bold uppercase tracking-wider rounded-xl hover:bg-yellow-500/20 transition-all disabled:opacity-50"
                      >
                        {recoveringId === m.id ? "Recuperando..." : "Recuperar Seed"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "markets" &&
            (loadingMarkets ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {markets.map((market) => (
                  <div
                    key={market.id}
                    className="bg-[#121212] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group cursor-pointer relative"
                    onClick={() => fetchMarketDetails(market.id)}
                  >
                    {loadingDetails && selectedMarketId === market.id && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-3xl z-10 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" />
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-1">
                        <span
                          className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${
                            market.status === "ACTIVE"
                              ? "bg-[#64c883]/10 text-[#64c883]"
                              : market.status === "DRAFT"
                                ? "bg-gray-800 text-gray-400"
                                : market.status === "RESOLVED"
                                  ? "bg-white/10 text-white"
                                  : "bg-[#e16464]/10 text-[#e16464]"
                          }`}
                        >
                          {market.status}
                        </span>
                        <h4 className="text-base font-bold text-white group-hover:text-[#64c883] transition-colors">
                          {market.question}
                        </h4>
                      </div>
                      <div
                        className="flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {market.status === "DRAFT" && (
                          <button
                            onClick={() => handleActivate(market.id)}
                            className="px-3 py-1 bg-[#64c883] text-[#0a0a0a] text-[9px] font-bold rounded-lg uppercase tracking-wider"
                          >
                            Activar
                          </button>
                        )}
                        {(market.status === "ACTIVE" ||
                          market.status === "CLOSED") && (
                          <button
                            onClick={() => setShowResolveModal(market)}
                            className="px-3 py-1 bg-[#64c883] text-[#0a0a0a] text-[9px] font-bold rounded-lg uppercase tracking-wider"
                          >
                            Resolver
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 bg-[#0a0a0a] p-4 rounded-xl border border-white/5">
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          YES Pool
                        </div>
                        <div className="text-sm font-extrabold text-[#64c883]">
                          $ {Number(market.yesPool || 0).toFixed(0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          NO Pool
                        </div>
                        <div className="text-sm font-extrabold text-[#e16464]">
                          $ {Number(market.noPool || 0).toFixed(0)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Total
                        </div>
                        <div className="text-sm font-extrabold text-white">
                          ${" "}
                          {(
                            Number(market.yesPool || 0) +
                            Number(market.noPool || 0)
                          ).toFixed(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === "users" &&
            (loadingUsers ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="bg-[#121212] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group cursor-pointer"
                    onClick={() => fetchUserDetails(u.id)}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center font-bold text-gray-400 uppercase text-xs border border-white/5">
                        {(u.username || u.email || "?")[0]}
                      </div>
                      <div>
                        <div className="text-base font-bold text-white group-hover:text-[#64c883] transition-colors truncate max-w-[150px]">
                          @{u.username || u.email.split("@")[0]}
                        </div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                            u.role === "ADMIN"
                              ? "bg-white/10 text-white"
                              : "bg-gray-800 text-gray-400"
                          }`}
                        >
                          {u.role}
                        </span>
                      </div>
                    </div>
                    <div className="bg-[#0a0a0a] p-3 rounded-xl border border-white/5 flex justify-between items-center mb-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Balance
                      </span>
                      <span className="text-base font-extrabold text-[#64c883]">
                        $ {Number(u.balance || 0).toFixed(2)}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleRole(u.id, u.role);
                      }}
                      className={`w-full py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all ${
                        u.role === "ADMIN"
                          ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                          : "bg-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      {u.role === "ADMIN" ? "Revocar Admin" : "Hacer Admin"}
                    </button>
                  </div>
                ))}
              </div>
            ))}

          {/* Table-based views for Purchases & Payments & RouterLogs updated to Dark Theme */}
          {(activeTab === "purchases" ||
            activeTab === "payments" ||
            activeTab === "router_logs") && (
            <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-[#171717]">
                      {activeTab === "purchases" ? (
                        <>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Mercado
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Posición
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Monto
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Usuario
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Estado
                          </th>
                        </>
                      ) : activeTab === "payments" ? (
                        <>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Usuario
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Tipo
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Monto
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Fecha
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Side
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Trader
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Resultado
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Routing Path
                          </th>
                          <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                            Fecha
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activeTab === "purchases"
                      ? purchases.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-white/5 transition-colors"
                          >
                            <td className="p-4 text-xs font-bold text-white">
                              {p.market.playerName || "Mercado"}
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${p.side === "YES" ? "bg-[#64c883]/10 text-[#64c883]" : "bg-[#e16464]/10 text-[#e16464]"}`}
                              >
                                {p.side} @{" "}
                                {parseFloat(p.initialProbability).toFixed(0)}%
                              </span>
                            </td>
                            <td className="p-4 text-sm font-extrabold text-white">
                              $ {parseFloat(p.amount).toFixed(2)}
                            </td>
                            <td className="p-4 text-xs font-bold text-white/40">
                              @{p.currentOwner.username}
                            </td>
                            <td className="p-4">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      : activeTab === "payments"
                        ? transactions.map((t) => (
                            <tr
                              key={t.id}
                              className="hover:bg-white/5 transition-colors"
                            >
                              <td className="p-4 text-xs font-bold text-white">
                                @{t.user.username}
                              </td>
                              <td className="p-4">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                  {t.type}
                                </span>
                              </td>
                              <td className="p-4 text-sm font-extrabold text-[#64c883]">
                                $ {Math.abs(parseFloat(t.amount)).toFixed(2)}
                              </td>
                              <td className="p-4 text-[10px] font-bold text-gray-400">
                                {new Date(t.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))
                        : routerLogs.map((log) => (
                            <tr
                              key={log.id}
                              className="hover:bg-white/5 transition-colors group cursor-pointer"
                              onClick={() => {
                                // Can add expansion logic here later if wanted
                              }}
                            >
                              <td className="p-4">
                                <span
                                  className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${log.side === "YES" ? "bg-[#64c883]/10 text-[#64c883]" : "bg-[#e16464]/10 text-[#e16464]"}`}
                                >
                                  {log.side}
                                </span>
                              </td>
                              <td className="p-4 text-xs font-bold text-white/70">
                                @{log.user?.username || "Sistema"}
                              </td>
                              <td className="p-4 text-[10px] font-bold text-white">
                                {log.executionSummary &&
                                  (log.executionSummary as any).spent && (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-gray-400">
                                        Presupuesto/Gasto:{" "}
                                        <span className="text-white">
                                          $
                                          {(
                                            log.executionSummary as any
                                          ).spent?.toFixed(2) || 0}
                                        </span>
                                      </span>
                                      <span className="text-gray-400">
                                        Shares Obt:{" "}
                                        <span className="text-white">
                                          $
                                          {(
                                            log.executionSummary as any
                                          ).sharesCollected?.toFixed(2) || 0}
                                        </span>
                                      </span>
                                    </div>
                                  )}
                              </td>
                              <td className="p-4">
                                {log.executionSummary &&
                                  (log.executionSummary as any).path && (
                                    <div className="flex flex-col gap-1 max-h-24 overflow-y-auto w-72 pr-2">
                                      {(
                                        (log.executionSummary as any)
                                          .path as any[]
                                      ).map((step, idx) => (
                                        <div
                                          key={idx}
                                          className="flex justify-between items-center text-[9px] font-bold text-gray-500 bg-[#0a0a0a] border border-white/5 p-1 rounded"
                                        >
                                          <span>
                                            $
                                            {(step as any).invertido?.toFixed(
                                              2,
                                            )}{" "}
                                            {"->"}{" "}
                                            {(step as any).shares?.toFixed(1)}sh
                                            (Prom. $
                                            {(
                                              step as any
                                            ).precioPromedio?.toFixed(2)}
                                            )
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                              </td>
                              <td className="p-4 text-[10px] font-bold text-gray-400">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                  </tbody>
                </table>
                {((activeTab === "purchases" && purchases.length === 0) ||
                  (activeTab === "payments" && transactions.length === 0) ||
                  (activeTab === "router_logs" && routerLogs.length === 0)) && (
                  <div className="text-center py-20 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                    No hay datos registrados
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down Modals (Dark Mode Update) */}
      <Modal
        isOpen={!!selectedUserStats}
        onClose={() => setSelectedUserStats(null)}
        title={`Perfil de Trading: @${selectedUserStats?.username || selectedUserStats?.email?.split("@")[0]}`}
        size="4xl"
      >
        {loadingDetails ? (
          <div className="py-20 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" />
          </div>
        ) : (
          selectedUserStats && (
            <div className="space-y-8 pt-4">
              <div className="grid grid-cols-3 gap-6">
                <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-white/5">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                    Inversión Total
                  </p>
                  <p className="text-2xl font-extrabold text-white">
                    ${" "}
                    {Number(selectedUserStats.stats.totalInvested || 0).toFixed(
                      0,
                    )}
                  </p>
                </div>
                <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-[#64c883]/10">
                  <p className="text-[10px] text-[#64c883]/60 font-bold uppercase tracking-wider mb-2">
                    Ganancias Reales
                  </p>
                  <p className="text-2xl font-extrabold text-[#64c883]">
                    ${" "}
                    {Number(selectedUserStats.stats.realizedGains || 0).toFixed(
                      0,
                    )}
                  </p>
                </div>
                <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-white/5">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                    Potencial
                  </p>
                  <p className="text-2xl font-extrabold text-white">
                    ${" "}
                    {Number(
                      selectedUserStats.stats.potentialFutureGains || 0,
                    ).toFixed(0)}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                  Historial de Compras
                </h3>
                <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
                  {selectedUserStats.positions.map((p: any) => (
                    <div
                      key={p.id}
                      className="flex justify-between items-center p-4 bg-[#121212] border border-white/5 rounded-2xl"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`px-2 py-1 text-[9px] font-bold rounded-lg uppercase ${p.side === "YES" ? "bg-[#64c883]/10 text-[#64c883]" : "bg-[#e16464]/10 text-[#e16464]"}`}
                        >
                          {p.side}
                        </div>
                        <span className="text-sm font-bold text-white">
                          {p.marketName}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-white">
                          $ {Number(p.amount || 0).toFixed(0)}{" "}
                          <span className="text-[10px] text-gray-400 ml-2">
                            @{Number(p.initialProbability || 0).toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        )}
      </Modal>

      <Modal
        isOpen={!!selectedMarketStats}
        onClose={() => setSelectedMarketStats(null)}
        title="Estadísticas de Mercado"
        size="4xl"
      >
        {loadingDetails ? (
          <div className="py-20 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" />
          </div>
        ) : (
          selectedMarketStats && (
            <div className="space-y-8 pt-4">
              {/* Header de Info Base */}
              <div className="flex items-center gap-4 px-1">
                <div className="bg-[#121212] px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                    ID Mercado
                  </div>
                  <div className="text-xs font-mono text-gray-400">
                    {selectedMarketStats.id}
                  </div>
                </div>
                <div className="bg-[#121212] px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider mb-0.5">
                    Liquidez (b)
                  </div>
                  <div className="text-xs font-mono text-white">
                    {selectedMarketStats.b || 100}
                  </div>
                </div>
                <div className="bg-[#121212] px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                    Seed Cost Inicial
                  </div>
                  <div className="text-xs font-mono text-gray-400">
                    ${" "}
                    {Number(
                      selectedMarketStats.liquidity?.initialSeed || 0,
                    ).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-white/5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4">
                  Evolución de Probabilidad
                </div>
                <PriceChart
                  data={selectedMarketStats.priceHistory}
                  height={180}
                />
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                    Liquidación Proyectada
                  </h3>
                  <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex justify-between items-center bg-[#0a0a0a] p-4 rounded-xl border border-white/5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        WIN (
                        {selectedMarketStats.platformFee
                          ? Number(selectedMarketStats.platformFee) * 100
                          : 10}
                        %)
                      </span>
                      <span className="text-lg font-extrabold text-white">
                        ${" "}
                        {Number(
                          selectedMarketStats.simulation?.platformCommission ??
                            0,
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-[9px] font-bold text-gray-500 uppercase">
                        Liquidez (b)
                      </span>
                      <span className="text-xs font-mono text-gray-300">
                        {selectedMarketStats.b || 100}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-[#64c883]/5 rounded-xl border border-[#64c883]/10">
                        <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider mb-1">
                          Si Gana SÍ
                        </div>
                        <div className="text-lg font-extrabold text-white">
                          x{" "}
                          {Number(
                            selectedMarketStats.simulation?.ifYesWins
                              ?.payoutPerDollar ?? 0,
                          ).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-4 bg-[#e16464]/5 rounded-xl border border-[#e16464]/10">
                        <div className="text-[9px] font-bold text-[#e16464] uppercase tracking-wider mb-1">
                          Si Gana NO
                        </div>
                        <div className="text-lg font-extrabold text-white">
                          x{" "}
                          {Number(
                            selectedMarketStats.simulation?.ifNoWins
                              ?.payoutPerDollar ?? 0,
                          ).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                    Distribución del Pool
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#121212] p-4 rounded-2xl border border-[#64c883]/10">
                      <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider mb-1">
                        YES Pool
                      </div>
                      <div className="text-xl font-extrabold text-[#64c883]">
                        $ {Number(selectedMarketStats.yesPool || 0).toFixed(0)}
                      </div>
                    </div>
                    <div className="bg-[#121212] p-4 rounded-2xl border border-[#e16464]/10">
                      <div className="text-[9px] font-bold text-[#e16464] uppercase tracking-wider mb-1">
                        NO Pool
                      </div>
                      <div className="text-xl font-extrabold text-[#e16464]">
                        $ {Number(selectedMarketStats.noPool || 0).toFixed(0)}
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#64c883] p-6 rounded-2xl text-[#0a0a0a] shadow-xl shadow-[#64c883]/10">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">
                      Volumen Total en Juego
                    </div>
                    <div className="text-3xl font-extrabold">
                      $ {Number(selectedMarketStats.totalPool || 0).toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* PnL Scenarios Section — Option B (Pago Proporcional) */}
              {(() => {
                const feeRate = selectedMarketStats.platformFee
                  ? Number(selectedMarketStats.platformFee)
                  : 0.015;
                const totalPool =
                  Number(selectedMarketStats.yesPool || 0) +
                  Number(selectedMarketStats.noPool || 0);
                // Fees se cobran sobre el bruto durante el trading
                // gross = net / (1 - fee) → fee = net × fee / (1 - fee)
                const collectedFees = (totalPool / (1 - feeRate)) * feeRate;
                const seedCost = Number(
                  selectedMarketStats.liquidity?.initialSeed || 0,
                );
                // Option B: todo el pool va a ganadores — WIN siempre recupera seed y gana fees
                // PnL WIN = fees (igual para cualquier outcome)
                // Pool distribuido = totalPool (100%)
                const winPnL = collectedFees;

                return (
                  <div className="pt-8 border-t border-white/10 space-y-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                        Escenarios de PnL WIN — Pago Proporcional (Option B)
                      </h3>
                      <div className="flex-1 h-[1px] bg-white/5" />
                      <div className="group relative">
                        <span className="cursor-help text-xs text-gray-500">ⓘ</span>
                        <div className="absolute bottom-full right-0 mb-2 w-80 p-3 bg-[#1a1a1a] text-[10px] text-gray-400 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          Pago proporcional (Option B): el pool completo se distribuye entre ganadores. WIN siempre recupera el seed y su ganancia = fees cobradas durante el trading (1.5% LMSR + 2% P2P). El resultado es idéntico para cualquier outcome.
                        </div>
                      </div>
                    </div>

                    {/* Resumen fijo de WIN */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-[#0a0a0a] border border-[#64c883]/20 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Fees Cobradas (1.5%)</p>
                        <p className="text-xl font-extrabold text-[#64c883]">+${collectedFees.toFixed(2)}</p>
                        <p className="text-[9px] text-gray-600 mt-1">Ingreso WIN (cualquier outcome)</p>
                      </div>
                      <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Seed Recuperado</p>
                        <p className="text-xl font-extrabold text-white">${seedCost.toFixed(2)}</p>
                        <p className="text-[9px] text-[#64c883] mt-1">✓ Siempre 100%</p>
                      </div>
                      <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Pool a Ganadores</p>
                        <p className="text-xl font-extrabold text-white">${totalPool.toFixed(2)}</p>
                        <p className="text-[9px] text-gray-600 mt-1">100% del pool usuario</p>
                      </div>
                    </div>

                    <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[#171717] border-b border-white/5 h-10 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                            <th className="pl-6">OUTCOME</th>
                            <th className="text-center">POOL USUARIOS</th>
                            <th className="text-center">DISTRIBUIDO A GANADORES</th>
                            <th className="text-center">FEES WIN (1.5%)</th>
                            <th className="text-center text-[#64c883]">PNL WIN</th>
                            <th className="pr-6 text-right text-[#64c883]">TESORERÍA WIN</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {["YES", "NO"].map((label) => (
                            <tr key={label} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors h-16">
                              <td className="pl-6">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider ${label === "YES" ? "bg-[#64c883]/10 text-[#64c883]" : "bg-[#e16464]/10 text-[#e16464]"}`}>
                                  GANA {label}
                                </span>
                              </td>
                              <td className="text-center text-xs font-bold text-white">
                                ${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="text-center text-xs font-bold text-[#e16464]">
                                -${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="text-center text-xs font-bold text-[#64c883]">
                                +${collectedFees.toFixed(2)}
                              </td>
                              <td className="text-center text-sm font-black text-[#64c883]">
                                +${winPnL.toFixed(2)}
                              </td>
                              <td className="pr-6 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-bold text-white">
                                    ${(collectedFees + seedCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[8px] text-gray-600 uppercase font-bold tracking-tighter mt-0.5">
                                    Fees + Seed
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Resolution Report Section (Visible only for resolved/voided markets) */}
              {(selectedMarketStats.status === "RESOLVED" ||
                selectedMarketStats.status === "VOIDED") &&
                selectedMarketStats.resolutionReport && (
                  <div className="space-y-6 pt-8 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-[#64c883] uppercase tracking-[0.2em]">
                        Reporte de Resolución
                      </h3>
                      <span className="px-3 py-1 bg-[#64c883]/10 text-[#64c883] text-[10px] font-bold rounded-lg uppercase tracking-wider">
                        Resultado: {selectedMarketStats.outcome}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-6 bg-[#121212] rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                          Total Pagado a Usuarios
                        </p>
                        <p className="text-2xl font-extrabold text-[#64c883]">
                          ${" "}
                          {Number(
                            selectedMarketStats.resolutionReport.results
                              .totalWinnings || 0,
                          ).toFixed(2)}
                        </p>
                        <p className="text-[9px] text-gray-500 mt-1">
                          {selectedMarketStats.resolutionReport.results.winners}{" "}
                          ganadores
                        </p>
                      </div>
                      <div className="p-6 bg-[#121212] rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                          Total Perdido por Usuarios
                        </p>
                        <p className="text-2xl font-extrabold text-[#e16464]">
                          ${" "}
                          {Number(
                            selectedMarketStats.resolutionReport.results
                              .totalLosses || 0,
                          ).toFixed(2)}
                        </p>
                        <p className="text-[9px] text-gray-500 mt-1">
                          {selectedMarketStats.resolutionReport.results.losers}{" "}
                          perdedores
                        </p>
                      </div>
                      <div className="p-6 bg-[#64c883]/10 rounded-2xl border border-[#64c883]/20">
                        <p className="text-[9px] text-[#64c883] font-bold uppercase tracking-wider mb-2">
                          Comisión Final WIN
                        </p>
                        <p className="text-2xl font-extrabold text-white">
                          ${" "}
                          {Number(
                            selectedMarketStats.resolutionReport.fees.total ||
                              0,
                          ).toFixed(2)}
                        </p>
                        <p className="text-[9px] text-gray-400 mt-1">
                          Primaria + Secundaria
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[#171717] border-b border-white/5">
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                              Usuario
                            </th>
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                              Lado
                            </th>
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">
                              Inversión (Usuario)
                            </th>
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">
                              Pago Realizado
                            </th>
                            <th className="p-4 text-[9px] font-bold text-white uppercase tracking-wider text-right bg-white/5">
                              RESULTADO WIN
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {selectedMarketStats.resolutionReport.positions.map(
                            (pos: any) => {
                              const winResult = pos.amount - pos.payout;
                              return (
                                <tr key={pos.id} className="hover:bg-white/5">
                                  <td className="p-4 text-xs font-bold text-white">
                                    @{pos.currentOwner}
                                  </td>
                                  <td className="p-4">
                                    <span
                                      className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${
                                        pos.side === "YES"
                                          ? "text-[#64c883] bg-[#64c883]/5"
                                          : "text-[#e16464] bg-[#e16464]/5"
                                      }`}
                                    >
                                      {pos.side}
                                    </span>
                                  </td>
                                  <td className="p-4 text-sm font-bold text-white/40 text-right">
                                    $ {pos.amount.toFixed(2)}
                                  </td>
                                  <td className="p-4 text-sm font-bold text-[#e16464] text-right">
                                    – $ {pos.payout.toFixed(2)}
                                  </td>
                                  <td
                                    className={`p-4 text-sm font-black text-right bg-white/[0.02] ${winResult >= 0 ? "text-[#64c883]" : "text-[#e16464]"}`}
                                  >
                                    {winResult >= 0 ? "+" : ""}${" "}
                                    {winResult.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Purchase History Section */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                  Historial de Operaciones
                </h3>
                <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#171717] border-b border-white/5">
                        <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Usuario
                        </th>
                        <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Lado
                        </th>
                        <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Monto
                        </th>
                        <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Prob.
                        </th>
                        <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Fecha
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedMarketStats.purchases.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider text-white/20"
                          >
                            No hay operaciones registradas
                          </td>
                        </tr>
                      ) : (
                        selectedMarketStats.purchases.map((p: any) => (
                          <tr
                            key={p.id}
                            className="hover:bg-white/5 transition-colors"
                          >
                            <td className="p-4 text-xs font-bold text-white">
                              @{p.username}
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${p.side === "YES" ? "bg-[#64c883]/10 text-[#64c883]" : "bg-[#e16464]/10 text-[#e16464]"}`}
                              >
                                {p.side}
                              </span>
                            </td>
                            <td className="p-4 text-sm font-extrabold text-white">
                              $ {Number(p.amount || 0).toFixed(2)}
                            </td>
                            <td className="p-4 text-xs font-bold text-[#64c883]">
                              {Number(p.initialProbability || 0).toFixed(0)}%
                            </td>
                            <td className="p-4 text-[10px] font-bold text-gray-400">
                              {new Date(p.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── MERCADO SECUNDARIO ── */}
              {selectedMarketStats.secondaryMarket && (
                <div className="space-y-6 pt-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                      Mercado Secundario (P2P / Order Book)
                    </h3>
                    <div className="flex-1 h-[1px] bg-white/5" />
                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider bg-blue-500/10 px-2 py-0.5 rounded-full">
                      P2P
                    </span>
                  </div>

                  {/* KPI summary */}
                  {(() => {
                    const sm = selectedMarketStats.secondaryMarket.summary;
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-[#121212] border border-white/5 rounded-2xl p-4">
                          <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                            Vol. P2P Ejecutado
                          </div>
                          <div className="text-xl font-extrabold text-white mt-1">
                            ${sm.totalP2PVolumeExecuted.toFixed(2)}
                          </div>
                          <div className="text-[9px] text-gray-600 mt-0.5">
                            {sm.p2pTradeCount} trades completados
                          </div>
                        </div>
                        <div className="bg-[#64c883]/10 border border-[#64c883]/20 rounded-2xl p-4">
                          <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider">
                            Ganancia WIN (FEE P2P)
                          </div>
                          <div className="text-xl font-extrabold text-[#64c883] mt-1">
                            + ${sm.totalP2PFeeCollected.toFixed(2)}
                          </div>
                          <div className="text-[9px] text-[#64c883]/60 mt-0.5">
                            2% sobre el Orderbook
                          </div>
                        </div>
                        <div className="bg-[#121212] border border-blue-500/10 rounded-2xl p-4">
                          <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                            Órdenes Abiertas
                          </div>
                          <div className="text-xl font-extrabold text-white mt-1">
                            {sm.openOrderCount}
                          </div>
                          <div className="text-[9px] text-gray-600 mt-0.5">
                            {sm.totalOpenShares.toFixed(2)} sh en el libro
                          </div>
                        </div>
                        <div className="bg-[#121212] border border-blue-500/10 rounded-2xl p-4">
                          <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                            Val. en el Libro
                          </div>
                          <div className="text-xl font-extrabold text-white mt-1">
                            ${sm.totalOpenOrderValue.toFixed(2)}
                          </div>
                          <div className="text-[9px] text-gray-600 mt-0.5">
                            si se ejecutan todas
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Open orders table */}
                  <div className="space-y-2">
                    <h4 className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.1em]">
                      📂 Órdenes Abiertas en el Libro
                    </h4>
                    <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[#171717] border-b border-white/5">
                            {[
                              "Usuario",
                              "Lado",
                              "Shares",
                              "Fills",
                              "Pendientes",
                              "Precio/sh",
                              "Val. Pend.",
                              "Estado",
                              "Fecha",
                            ].map((h) => (
                              <th
                                key={h}
                                className="p-3 text-[9px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {selectedMarketStats.secondaryMarket.openOrders
                            .length === 0 ? (
                            <tr>
                              <td
                                colSpan={9}
                                className="p-8 text-center text-[10px] font-bold text-white/20 uppercase"
                              >
                                No hay órdenes abiertas
                              </td>
                            </tr>
                          ) : (
                            selectedMarketStats.secondaryMarket.openOrders.map(
                              (o: any) => (
                                <tr
                                  key={o.id}
                                  className="hover:bg-white/5 transition-colors"
                                >
                                  <td className="p-3 text-xs font-bold text-white">
                                    @{o.username}
                                  </td>
                                  <td className="p-3">
                                    <span
                                      className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${o.side === "YES" ? "bg-[#64c883]/10 text-[#64c883]" : "bg-[#e16464]/10 text-[#e16464]"}`}
                                    >
                                      {o.side}
                                    </span>
                                  </td>
                                  <td className="p-3 text-xs font-bold text-white">
                                    {o.initialShares.toFixed(2)}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-[#64c883]">
                                    {o.filledShares.toFixed(2)}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-blue-400">
                                    {o.remainingShares.toFixed(2)}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-white">
                                    ${o.pricePerShare.toFixed(4)}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-white">
                                    $
                                    {(
                                      o.remainingShares * o.pricePerShare
                                    ).toFixed(2)}
                                  </td>
                                  <td className="p-3">
                                    <span
                                      className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${o.status === "PARTIAL" ? "bg-yellow-500/10 text-yellow-400" : "bg-blue-500/10 text-blue-400"}`}
                                    >
                                      {o.status}
                                    </span>
                                  </td>
                                  <td className="p-3 text-[10px] font-bold text-gray-400">
                                    {new Date(o.createdAt).toLocaleDateString()}
                                  </td>
                                </tr>
                              ),
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* P2P Transctions table */}
                  <div className="space-y-2">
                    <h4 className="text-[9px] font-bold text-[#64c883] uppercase tracking-[0.1em]">
                      ✅ Transacciones Mercado Secundario (P2P)
                    </h4>
                    <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[#171717] border-b border-white/5">
                            {[
                              "Comprador",
                              "Vendedor (Recibe Neto)",
                              "Monto Bruto",
                              "Monto Neto",
                              "Fee WIN (2%)",
                              "Fecha",
                            ].map((h) => (
                              <th
                                key={h}
                                className="p-3 text-[9px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {selectedMarketStats.secondaryMarket.obFills
                            .length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="p-8 text-center text-[10px] font-bold text-white/20 uppercase"
                              >
                                No hay transacciones P2P ejecutadas aún
                              </td>
                            </tr>
                          ) : (
                            selectedMarketStats.secondaryMarket.obFills.map(
                              (f: any, idx: number) => (
                                <tr
                                  key={f.id || idx}
                                  className="hover:bg-white/5 transition-colors"
                                >
                                  <td className="p-3 text-xs font-bold text-[#64c883]">
                                    @{f.buyer}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-gray-400">
                                    @{f.seller}
                                  </td>
                                  <td className="p-3 text-xs text-white">
                                    ${f.grossAmount.toFixed(2)}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-blue-300">
                                    ${f.netAmount.toFixed(2)}
                                  </td>
                                  <td className="p-3 text-sm font-extrabold text-[#64c883]">
                                    + ${f.fee.toFixed(2)}
                                  </td>
                                  <td className="p-3 text-[10px] font-bold text-gray-400 whitespace-nowrap">
                                    {new Date(f.timestamp).toLocaleDateString()}
                                  </td>
                                </tr>
                              ),
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </Modal>

      {/* Form Modals (Simplified Dark Overhaul) */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Nuevo Mercado"
      >
        <div className="space-y-6 pt-4">
          <div className="space-y-4">
            <div className="group">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                Pregunta del Mercado
              </label>
              <input
                className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                value={newMarket.question}
                onChange={(e) =>
                  setNewMarket({ ...newMarket, question: e.target.value })
                }
                placeholder="¿Ej: Argentina ganará el mundial?"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                Fecha Resolución
              </label>
              <input
                type="date"
                className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                value={newMarket.resolutionDate}
                onChange={(e) =>
                  setNewMarket({
                    ...newMarket,
                    resolutionDate: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  Liquidez (b)
                </label>
                <input
                  type="number"
                  className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                  value={newMarket.b}
                  onChange={(e) =>
                    setNewMarket({ ...newMarket, b: e.target.value })
                  }
                  placeholder="100"
                />
                <p className="text-[9px] text-gray-500 px-1 mt-1">
                  Mayor b = Menos volatilidad
                </p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  CAP Transacción ($)
                </label>
                <input
                  type="number"
                  className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                  value={newMarket.maxBetAmount}
                  onChange={(e) =>
                    setNewMarket({ ...newMarket, maxBetAmount: e.target.value })
                  }
                  placeholder="Ilimitado"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  CAP Variación p (%)
                </label>
                <input
                  type="number"
                  className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                  value={newMarket.maxPriceImpact}
                  onChange={(e) =>
                    setNewMarket({
                      ...newMarket,
                      maxPriceImpact: e.target.value,
                    })
                  }
                  placeholder="Global"
                  step="0.1"
                />
              </div>
            </div>

            {/* Probabilidad inicial configurable (Option B advantage) */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">
                Probabilidad inicial YES (%)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="5"
                  max="95"
                  step="5"
                  className="flex-1 accent-[#64c883]"
                  value={newMarket.initialProbabilityYes}
                  onChange={(e) =>
                    setNewMarket({ ...newMarket, initialProbabilityYes: e.target.value })
                  }
                />
                <span className="text-white font-bold w-20 text-right text-sm">
                  {newMarket.initialProbabilityYes}% / {100 - parseInt(newMarket.initialProbabilityYes)}%
                </span>
              </div>
              <div className="flex justify-between text-[9px] text-gray-500 uppercase tracking-wider">
                <span>Poco probable</span>
                <span>50/50</span>
                <span>Probable</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="w-full h-16 bg-[#64c883] text-[#0a0a0a] text-xs font-bold uppercase tracking-[0.1em] rounded-2xl transition-all hover:scale-[1.02] shadow-xl shadow-[#64c883]/10"
          >
            {creating ? "Creando..." : "Lanzar Mercado"}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={!!showResolveModal}
        onClose={() => setShowResolveModal(null)}
        title="Resolver Resultado Final"
      >
        {showResolveModal && (
          <div className="space-y-8 pt-4">
            <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 text-center">
              <p className="text-lg font-bold text-white mb-4">
                {showResolveModal.question}
              </p>
              <div className="flex justify-center gap-6 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <span>
                  SÍ: $ {Number(showResolveModal.yesPool || 0).toFixed(0)}
                </span>
                <span>
                  NO: $ {Number(showResolveModal.noPool || 0).toFixed(0)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => handleResolve("YES")}
                disabled={resolving}
                className="h-16 bg-[#64c883] text-[#0a0a0a] text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resolving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent" />
                ) : (
                  "SÍ Gana"
                )}
              </button>
              <button
                onClick={() => handleResolve("NO")}
                disabled={resolving}
                className="h-16 bg-[#e16464] text-[#0a0a0a] text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resolving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent" />
                ) : (
                  "NO Gana"
                )}
              </button>
              <button
                onClick={() => handleResolve("VOID")}
                disabled={resolving}
                className="h-16 bg-white/5 text-gray-400 text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resolving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                ) : (
                  "Anular"
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  );
}

export default function Page() {
  return (
    <UserProvider>
      <AdminPage />
    </UserProvider>
  );
}
