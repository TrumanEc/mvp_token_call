"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/Shell";
import { Modal } from "@/components/ui/Modal";
import { PriceChart } from "@/components/markets/PriceChart";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { LmsrCalculator } from "./lmsr-calculator";
import { DateTimePicker } from "@/components/ui/DateTimePicker";

// ─── Helpers de zona horaria Argentina (UTC-3, sin DST) ──────────────────
const ARG_OFFSET = "-03:00";

/**
 * Toma el valor de un <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") y lo
 * convierte a un ISO string con offset Argentina. El backend recibe el instante
 * UTC correcto independientemente del huso horario del navegador del admin.
 */
function argDatetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  // value es "YYYY-MM-DDTHH:mm" (a veces incluye :ss). Le agregamos el offset.
  const normalized = value.length === 16 ? `${value}:00` : value;
  return `${normalized}${ARG_OFFSET}`;
}

/**
 * Toma un ISO (UTC u otro huso) y lo formatea como "YYYY-MM-DDTHH:mm" en
 * hora Argentina para popularse en un <input type="datetime-local">.
 */
function isoToArgDatetimeLocal(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "";
  // Sumar el offset de Argentina (-03:00) → equivale a restar 3h al UTC.
  const argMs = d.getTime() - 3 * 60 * 60 * 1000;
  return new Date(argMs).toISOString().slice(0, 16);
}

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
  const [editingMarket, setEditingMarket] = useState<any>(null);

  const handleDeleteMarket = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar permanentemente este mercado y TODO su historial (posiciones, órdenes, transacciones)? Esta acción NO se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/admin/markets/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error eliminando el mercado");
      }
      alert("Mercado eliminado correctamente");
      setSelectedMarketStats(null);
      fetchMarkets();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleUpdateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/markets/${editingMarket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editingMarket,
          resolutionDate: argDatetimeLocalToIso(editingMarket.resolutionDate) ?? editingMarket.resolutionDate,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error actualizando mercado");
      }
      alert("Mercado actualizado correctamente");
      setEditingMarket(null);
      fetchMarketDetails(editingMarket.id);
      fetchMarkets();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const [newMarket, setNewMarket] = useState({
    playerName: "",
    question: "",
    description: "",
    resolutionDate: "",
    maxPool: "",
    maxBetAmount: "",
    maxPriceImpact: "",
    marketType: "BINARY" as "BINARY" | "MULTIPLE",
    initialProbabilityYes: "50",
    outcomes: [
      { name: "Opción 1", probability: "50", color: "#64c883" },
      { name: "Opción 2", probability: "50", color: "#f87171" },
    ],
    alpha: "0.15",
    bMin: "1000",
    imageUrl: "",
    bannerUrl: "",
    isFeatured: false,
    rules: "",
    criterio: "",
    tags: "",
  });

  const [editMetaMarket, setEditMetaMarket] = useState<any>(null);
  const [editMeta, setEditMeta] = useState({ imageUrl: "", bannerUrl: "", isFeatured: false, rules: "", criterio: "", tags: "" });
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) {
      router.push("/");
    }
  }, [user, loading, router]);

  const fetchMarkets = () => {
    setLoadingMarkets(true);
    fetch("/api/markets?admin=1")
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
        console.error("Error fetching market stats:", statsData);
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
    if (newMarket.marketType === "MULTIPLE") {
      const sum = newMarket.outcomes.reduce((acc, curr) => acc + parseFloat(curr.probability || "0"), 0);
      if (Math.abs(sum - 100) > 0.01) {
        alert(`Las probabilidades deben sumar 100%. Suma actual: ${sum}%`);
        return;
      }
    }

    setCreating(true);
    try {
      const outcomesPayload = newMarket.marketType === "MULTIPLE"
        ? newMarket.outcomes.map(o => ({
            name: o.name,
            color: o.color,
            initialProbability: parseFloat(o.probability) / 100
          }))
        : [
            { name: "YES", color: "#64c883", initialProbability: parseFloat(newMarket.initialProbabilityYes) / 100 || 0.5 },
            { name: "NO", color: "#f87171", initialProbability: 1 - (parseFloat(newMarket.initialProbabilityYes) / 100 || 0.5) }
          ];

      const alpha = parseFloat(newMarket.alpha) || 0.15;
      const bMin = parseFloat(newMarket.bMin) || 1000;

      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newMarket,
          resolutionDate: argDatetimeLocalToIso(newMarket.resolutionDate),
          outcomes: outcomesPayload,
          maxPool: newMarket.maxPool
            ? parseFloat(newMarket.maxPool)
            : undefined,
          b: bMin,
          alpha,
          bMin,
          maxBetAmount: newMarket.maxBetAmount
            ? parseFloat(newMarket.maxBetAmount)
            : undefined,
          maxPriceImpact: newMarket.maxPriceImpact
            ? parseFloat(newMarket.maxPriceImpact)
            : undefined,
          imageUrl: newMarket.imageUrl || undefined,
          bannerUrl: newMarket.bannerUrl || undefined,
          isFeatured: newMarket.isFeatured,
          rules: newMarket.rules || undefined,
          criterio: newMarket.criterio || undefined,
          tags: newMarket.tags ? newMarket.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
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
          maxBetAmount: "",
          maxPriceImpact: "",
          marketType: "BINARY",
          initialProbabilityYes: "50",
          outcomes: [
            { name: "Opción 1", probability: "50", color: "#64c883" },
            { name: "Opción 2", probability: "50", color: "#f87171" },
          ],
          alpha: "0.15",
          bMin: "1000",
          imageUrl: "",
          bannerUrl: "",
          isFeatured: false,
          rules: "",
          criterio: "",
          tags: "",
        });
        fetchMarkets();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!editMetaMarket) return;
    setSavingMeta(true);
    try {
      await fetch(`/api/markets/${editMetaMarket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateMeta",
          imageUrl: editMeta.imageUrl || null,
          bannerUrl: editMeta.bannerUrl || null,
          isFeatured: editMeta.isFeatured,
          rules: editMeta.rules || null,
          criterio: editMeta.criterio || null,
          tags: editMeta.tags ? editMeta.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
        }),
      });
      setEditMetaMarket(null);
      fetchMarkets();
    } finally {
      setSavingMeta(false);
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

  const [pauseModal, setPauseModal] = useState<{ id: string; name: string } | null>(null);
  const [pauseScheduledAt, setPauseScheduledAt] = useState("");

  const handlePausePrimary = async (id: string, scheduledAt?: string) => {
    await fetch(`/api/markets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pausePrimary",
        ...(scheduledAt ? { scheduledAt } : {}),
      }),
    });
    setPauseModal(null);
    setPauseScheduledAt("");
    fetchMarkets();
  };

  const handleUnpausePrimary = async (id: string) => {
    await fetch(`/api/markets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpausePrimary" }),
    });
    fetchMarkets();
  };

  const handleResolve = async (winningOutcomeId: string) => {
    setResolving(true);
    try {
      await fetch(`/api/markets/${showResolveModal.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winningOutcomeId }),
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
      <div className="min-h-screen bg-win-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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

          <div className="flex overflow-x-auto bg-win-bg p-1 rounded-xl border border-white/5">
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
                    ? "bg-primary text-win-bg shadow-lg shadow-primary/10"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-win-bg p-4 rounded-2xl border border-white/5">
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
                className="bg-win-bg text-white text-[10px] font-bold uppercase tracking-[0.1em] px-4 py-2 border border-white/5 rounded-xl outline-none focus:border-primary transition-all"
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
                className="bg-primary text-win-bg text-[10px] font-bold uppercase tracking-[0.1em] px-5 py-2 rounded-xl transition-all hover:scale-[1.02]"
              >
                + Crear Mercado
              </button>
            )}
            {activeTab === "users" && (
              <button
                onClick={() => setShowCreateUserModal(true)}
                className="bg-white text-win-bg text-[10px] font-bold uppercase tracking-[0.1em] px-5 py-2 rounded-xl transition-all hover:scale-[1.02]"
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
              <div className="bg-win-bg border border-yellow-500/20 rounded-2xl p-4 text-[11px] text-yellow-400">
                Mercados sin actividad (sin posiciones). Podés recuperar el seed voidando el mercado.
              </div>
              {loadingInactive ? (
                <div className="flex justify-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
                      className="bg-win-bg border border-white/5 rounded-2xl p-5 flex items-center justify-between gap-4"
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {markets.map((market) => (
                  <div
                    key={market.id}
                    className="bg-win-bg border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group cursor-pointer relative"
                    onClick={() => fetchMarketDetails(market.id)}
                  >
                    {loadingDetails && selectedMarketId === market.id && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-3xl z-10 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-1">
                        <span
                          className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${
                            market.status === "ACTIVE"
                              ? "bg-primary/10 text-primary"
                              : market.status === "DRAFT"
                                ? "bg-gray-800 text-gray-400"
                                : market.status === "RESOLVED"
                                  ? "bg-white/10 text-white"
                                  : "bg-win-error/10 text-win-error"
                          }`}
                        >
                          {market.status}
                        </span>
                        {market.status === "ACTIVE" && (() => {
                          const isPaused =
                            market.primaryMarketPaused ||
                            (market.primaryPauseScheduledAt &&
                              new Date(market.primaryPauseScheduledAt) <= new Date());
                          const isScheduled =
                            !market.primaryMarketPaused &&
                            market.primaryPauseScheduledAt &&
                            new Date(market.primaryPauseScheduledAt) > new Date();
                          if (isPaused) {
                            return (
                              <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-orange-500/20 text-orange-400">
                                ⏸ Primario Pausado
                              </span>
                            );
                          }
                          if (isScheduled) {
                            return (
                              <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-yellow-500/20 text-yellow-400">
                                ⏱ Pausa programada
                              </span>
                            );
                          }
                          return null;
                        })()}
                        <h4 className="text-base font-bold text-white group-hover:text-primary transition-colors">
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
                            className="px-3 py-1 bg-primary text-win-bg text-[9px] font-bold rounded-lg uppercase tracking-wider"
                          >
                            Activar
                          </button>
                        )}
                        {market.status === "ACTIVE" && (() => {
                          const isPaused =
                            market.primaryMarketPaused ||
                            (market.primaryPauseScheduledAt &&
                              new Date(market.primaryPauseScheduledAt) <= new Date());
                          return isPaused ? (
                            <button
                              onClick={() => handleUnpausePrimary(market.id)}
                              className="px-3 py-1 bg-yellow-500 text-win-bg text-[9px] font-bold rounded-lg uppercase tracking-wider"
                            >
                              ▶ Reanudar
                            </button>
                          ) : (
                            <button
                              onClick={() => setPauseModal({ id: market.id, name: market.playerName || market.question })}
                              className="px-3 py-1 bg-orange-500 text-white text-[9px] font-bold rounded-lg uppercase tracking-wider"
                            >
                              ⏸ Pausar
                            </button>
                          );
                        })()}
                        {(market.status === "ACTIVE" ||
                          market.status === "CLOSED") && (
                          <button
                            onClick={() => setShowResolveModal(market)}
                            className="px-3 py-1 bg-primary text-win-bg text-[9px] font-bold rounded-lg uppercase tracking-wider"
                          >
                            Resolver
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditMetaMarket(market);
                            setEditMeta({
                              imageUrl: market.imageUrl ?? "",
                              bannerUrl: market.bannerUrl ?? "",
                              isFeatured: market.isFeatured ?? false,
                              rules: market.rules ?? "",
                              criterio: market.criterio ?? "",
                              tags: (market.tags ?? []).join(", "),
                            });
                          }}
                          className="px-3 py-1 bg-white/5 text-gray-300 text-[9px] font-bold rounded-lg uppercase tracking-wider hover:bg-white/10 border border-white/10"
                        >
                          ✎ Media
                        </button>
                      </div>
                    </div>
                    <div className="bg-win-bg p-4 rounded-xl border border-white/5">
                      {/* Outcome probability bars — probability already in 0-100 from MarketService.getAll() */}
                      <div className="space-y-1.5 mb-3">
                        {(market.outcomes || []).slice(0, 4).map((o: any, i: number) => {
                          const pct = Number(o.probability ?? 0)
                          return (
                          <div key={o.id} className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-gray-400 w-16 truncate">{o.name}</span>
                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${pct.toFixed(0)}%`, opacity: 1 - i * 0.15 }}
                              />
                            </div>
                            <span className="text-[9px] font-bold text-white w-8 text-right">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        )})}
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Vol. Total</span>
                        <span className="text-sm font-extrabold text-white">$ {Number(market.totalPool || 0).toFixed(0)}</span>
                      </div>
                    </div>

                    {/* Liquidity params row */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {market.alpha != null ? (
                        <>
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-purple-500/15 text-purple-300">
                            LS-LMSR · α={Number(market.alpha).toFixed(2)} · b_min={Number(market.bMin).toFixed(0)}
                          </span>
                          {market.effectiveB != null && (
                            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-white/5 text-gray-400">
                              b actual: {Number(market.effectiveB).toFixed(0)} · Q: {Number(market.Q ?? 0).toFixed(0)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-blue-500/15 text-blue-300">
                          LMSR estático · b={Number(market.b).toFixed(0)}
                        </span>
                      )}
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
                    className="bg-win-bg border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group cursor-pointer"
                    onClick={() => fetchUserDetails(u.id)}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center font-bold text-gray-400 uppercase text-xs border border-white/5">
                        {(u.username || u.email || "?")[0]}
                      </div>
                      <div>
                        <div className="text-base font-bold text-white group-hover:text-primary transition-colors truncate max-w-[150px]">
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
                    <div className="bg-win-bg p-3 rounded-xl border border-white/5 flex justify-between items-center mb-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Balance
                      </span>
                      <span className="text-base font-extrabold text-primary">
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
            <div className="bg-win-bg border border-white/5 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-win-card">
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
                              <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-white/10 text-white">
                                {p.outcome?.name || p.side} @{" "}
                                {(parseFloat(p.initialProbability) <= 1 ? parseFloat(p.initialProbability) * 100 : parseFloat(p.initialProbability)).toFixed(0)}%
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
                              <td className="p-4 text-sm font-extrabold text-primary">
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
                                  className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${log.side === "YES" ? "bg-primary/10 text-primary" : "bg-win-error/10 text-win-error"}`}
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
                                          className="flex justify-between items-center text-[9px] font-bold text-gray-500 bg-win-bg border border-white/5 p-1 rounded"
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

      {/* Edit Market Meta Modal */}
      <Modal
        isOpen={!!editMetaMarket}
        onClose={() => setEditMetaMarket(null)}
        title={`Media & Configuración · ${editMetaMarket?.playerName || editMetaMarket?.question?.slice(0, 40)}`}
        size="xl"
      >
        <div className="space-y-4 p-1">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">URL Imagen de tarjeta</label>
            <input
              type="url"
              className="w-full bg-win-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              placeholder="https://..."
              value={editMeta.imageUrl}
              onChange={(e) => setEditMeta(m => ({ ...m, imageUrl: e.target.value }))}
            />
            {editMeta.imageUrl && (
              <img src={editMeta.imageUrl} alt="preview" className="mt-2 h-20 w-full object-cover rounded-lg border border-white/5" />
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">URL Banner (hero)</label>
            <input
              type="url"
              className="w-full bg-win-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              placeholder="https://..."
              value={editMeta.bannerUrl}
              onChange={(e) => setEditMeta(m => ({ ...m, bannerUrl: e.target.value }))}
            />
            {editMeta.bannerUrl && (
              <img src={editMeta.bannerUrl} alt="banner preview" className="mt-2 h-24 w-full object-cover rounded-lg border border-white/5" />
            )}
          </div>
          <div className="flex items-center gap-3 bg-white/3 rounded-lg px-3 py-2.5 border border-white/5">
            <input
              type="checkbox"
              id="isFeatured"
              checked={editMeta.isFeatured}
              onChange={(e) => setEditMeta(m => ({ ...m, isFeatured: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="isFeatured" className="text-[12px] font-semibold text-white cursor-pointer">
              Mostrar en slider principal (Featured)
            </label>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Reglas del mercado</label>
            <textarea
              rows={3}
              className="w-full bg-win-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none"
              placeholder="Escribe las reglas del mercado..."
              value={editMeta.rules}
              onChange={(e) => setEditMeta(m => ({ ...m, rules: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Criterio de resolución</label>
            <textarea
              rows={2}
              className="w-full bg-win-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none"
              placeholder="¿Bajo qué criterio se resuelve este mercado?"
              value={editMeta.criterio}
              onChange={(e) => setEditMeta(m => ({ ...m, criterio: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Etiquetas (separadas por coma)</label>
            <input
              type="text"
              className="w-full bg-win-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              placeholder="transferencia, LaLiga, Argentina..."
              value={editMeta.tags}
              onChange={(e) => setEditMeta(m => ({ ...m, tags: e.target.value }))}
            />
            {editMeta.tags && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {editMeta.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => (
                  <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSaveMeta}
            disabled={savingMeta}
            className="w-full py-2.5 rounded-lg bg-primary text-win-bg text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {savingMeta ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </Modal>

      {/* Drill-down Modals (Dark Mode Update) */}
      <Modal
        isOpen={!!selectedUserStats}
        onClose={() => setSelectedUserStats(null)}
        title={`Perfil de Trading: @${selectedUserStats?.username || selectedUserStats?.email?.split("@")[0]}`}
        size="4xl"
      >
        {loadingDetails ? (
          <div className="py-20 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          selectedUserStats && (
            <div className="space-y-8 pt-4">
              <div className="grid grid-cols-3 gap-6">
                <div className="p-6 bg-win-bg rounded-2xl border border-white/5">
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
                <div className="p-6 bg-win-bg rounded-2xl border border-primary/10">
                  <p className="text-[10px] text-primary/60 font-bold uppercase tracking-wider mb-2">
                    Ganancias Reales
                  </p>
                  <p className="text-2xl font-extrabold text-primary">
                    ${" "}
                    {Number(selectedUserStats.stats.realizedGains || 0).toFixed(
                      0,
                    )}
                  </p>
                </div>
                <div className="p-6 bg-win-bg rounded-2xl border border-white/5">
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
                      className="flex justify-between items-center p-4 bg-win-bg border border-white/5 rounded-2xl"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`px-2 py-1 text-[9px] font-bold rounded-lg uppercase ${p.side === "YES" ? "bg-primary/10 text-primary" : "bg-win-error/10 text-win-error"}`}
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          selectedMarketStats && (
            <div className="space-y-8 pt-4">
              {/* ── Title row with actions ─────────────────────────── */}
              <div className="flex items-start justify-between gap-4 px-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white leading-snug line-clamp-2">{selectedMarketStats.question}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingMarket({
                      id: selectedMarketStats.id,
                      question: selectedMarketStats.question,
                      description: selectedMarketStats.description || "",
                      resolutionDate: isoToArgDatetimeLocal(selectedMarketStats.resolutionDate),
                      sport: selectedMarketStats.sport || "futbol",
                    })}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-[10px] font-bold text-white uppercase tracking-wider transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteMarket(selectedMarketStats.id)}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-[10px] font-bold text-red-400 uppercase tracking-wider transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Header de Info Base */}
              <div className="flex items-center gap-4 px-1">
                <div className="bg-win-bg px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                    ID Mercado
                  </div>
                  <div className="text-xs font-mono text-gray-400">
                    {selectedMarketStats.id}
                  </div>
                </div>
                <div className="bg-win-bg px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-[9px] font-bold text-primary uppercase tracking-wider mb-0.5">
                    Liquidez efectiva b(Q)
                  </div>
                  <div className="text-xs font-mono text-white">
                    {Number(selectedMarketStats.effectiveB ?? selectedMarketStats.bMin ?? selectedMarketStats.b ?? 0).toFixed(0)}
                  </div>
                  <div className="text-[8px] font-mono text-gray-500 mt-0.5">
                    α={Number(selectedMarketStats.alpha ?? 0).toFixed(2)} · b_min={Number(selectedMarketStats.bMin ?? 0).toFixed(0)} · Q={Number(selectedMarketStats.Q ?? 0).toFixed(0)}
                  </div>
                </div>
                <div className="bg-win-bg px-4 py-2 rounded-xl border border-white/5">
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

              <div className="bg-win-bg p-6 rounded-2xl border border-white/5">
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
                  <div className="bg-win-bg p-6 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex justify-between items-center bg-win-bg p-4 rounded-xl border border-white/5">
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
                        Liquidez efectiva b(Q)
                      </span>
                      <span className="text-xs font-mono text-gray-300">
                        {Number(selectedMarketStats.effectiveB ?? selectedMarketStats.bMin ?? selectedMarketStats.b ?? 0).toFixed(0)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(selectedMarketStats.outcomes || []).slice(0, 4).map((o: any, i: number) => (
                        <div key={o.id} className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                          <div className="text-[9px] font-bold text-primary uppercase tracking-wider mb-1 truncate">
                            Si Gana {o.name}
                          </div>
                          <div className="text-base font-extrabold text-white">
                            x {Number(selectedMarketStats.simulation?.byOutcome?.[o.name]?.payoutPerDollar ?? 0).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                    Distribución del Pool
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {(selectedMarketStats.outcomes || []).slice(0, 4).map((o: any, i: number) => (
                      <div key={o.id} className="bg-win-bg p-4 rounded-2xl border border-primary/10">
                        <div className="text-[9px] font-bold text-primary uppercase tracking-wider mb-1 truncate">{o.name}</div>
                        {/* price is 0-1 from stats API */}
                        <div className="text-lg font-extrabold text-primary">{(Number(o.price ?? 0) * 100).toFixed(1)}%</div>
                        <div className="text-[9px] text-gray-500 mt-0.5">${Number(o.pool || 0).toFixed(0)} en pool</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-primary p-6 rounded-2xl text-win-bg shadow-xl shadow-primary/10">
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
                        <div className="absolute bottom-full right-0 mb-2 w-80 p-3 bg-win-card text-[10px] text-gray-400 rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          Pago proporcional (Option B): el pool completo se distribuye entre ganadores. WIN siempre recupera el seed y su ganancia = fees cobradas durante el trading (1.5% LMSR + 2% P2P). El resultado es idéntico para cualquier outcome.
                        </div>
                      </div>
                    </div>

                    {/* Resumen fijo de WIN */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-win-bg border border-primary/20 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Fees Cobradas (1.5%)</p>
                        <p className="text-xl font-extrabold text-primary">+${collectedFees.toFixed(2)}</p>
                        <p className="text-[9px] text-gray-600 mt-1">Ingreso WIN (cualquier outcome)</p>
                      </div>
                      <div className="bg-win-bg border border-white/5 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Seed Recuperado</p>
                        <p className="text-xl font-extrabold text-white">${seedCost.toFixed(2)}</p>
                        <p className="text-[9px] text-primary mt-1">✓ Siempre 100%</p>
                      </div>
                      <div className="bg-win-bg border border-white/5 rounded-2xl p-4 text-center">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Pool a Ganadores</p>
                        <p className="text-xl font-extrabold text-white">${totalPool.toFixed(2)}</p>
                        <p className="text-[9px] text-gray-600 mt-1">100% del pool usuario</p>
                      </div>
                    </div>

                    <div className="bg-win-bg border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-win-card border-b border-white/5 h-10 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                            <th className="pl-6">OUTCOME</th>
                            <th className="text-center">POOL USUARIOS</th>
                            <th className="text-center">DISTRIBUIDO A GANADORES</th>
                            <th className="text-center">FEES WIN (1.5%)</th>
                            <th className="text-center text-primary">PNL WIN</th>
                            <th className="pr-6 text-right text-primary">TESORERÍA WIN</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(selectedMarketStats.outcomes || [{ name: "YES" }, { name: "NO" }]).map((o: any) => (
                            <tr key={o.id || o.name} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors h-16">
                              <td className="pl-6">
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider bg-primary/10 text-primary">
                                  GANA {o.name}
                                </span>
                              </td>
                              <td className="text-center text-xs font-bold text-white">
                                ${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="text-center text-xs font-bold text-win-error">
                                -${totalPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="text-center text-xs font-bold text-primary">
                                +${collectedFees.toFixed(2)}
                              </td>
                              <td className="text-center text-sm font-black text-primary">
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
                      <h3 className="text-xs font-bold text-primary uppercase tracking-[0.2em]">
                        Reporte de Resolución
                      </h3>
                      <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-lg uppercase tracking-wider">
                        Resultado: {selectedMarketStats.resolutionReport.market?.winningOutcome ?? "—"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-5 bg-win-bg rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                          Total Pagado a Ganadores
                        </p>
                        <p className="text-2xl font-extrabold text-primary">
                          ${" "}
                          {Number(
                            selectedMarketStats.resolutionReport.results
                              .totalWinnings || 0,
                          ).toFixed(2)}
                        </p>
                        <p className="text-[9px] text-gray-500 mt-1">
                          {selectedMarketStats.resolutionReport.results.winners}{" "}
                          ganador{selectedMarketStats.resolutionReport.results.winners !== 1 ? "es" : ""}
                        </p>
                      </div>
                      <div className="p-5 bg-win-bg rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                          Pago por Share Ganador
                        </p>
                        <p className="text-2xl font-extrabold text-white">
                          ${" "}
                          {Number(
                            selectedMarketStats.resolutionReport.results?.payoutPerShare || 0,
                          ).toFixed(4)}
                        </p>
                        <p className="text-[9px] text-gray-500 mt-1">
                          Pool ÷ shares ganadores
                        </p>
                      </div>
                      <div className="p-5 bg-win-bg rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-2">
                          Posiciones Perdedoras
                        </p>
                        <p className="text-2xl font-extrabold text-win-error">
                          {selectedMarketStats.resolutionReport.results.losers}
                        </p>
                        <p className="text-[9px] text-gray-500 mt-1">
                          ${Number(selectedMarketStats.resolutionReport.results.totalLosses || 0).toFixed(2)} en riesgo
                        </p>
                      </div>
                      <div className="p-5 bg-primary/10 rounded-2xl border border-primary/20">
                        <p className="text-[9px] text-primary font-bold uppercase tracking-wider mb-2">
                          Fees WIN ({Number((selectedMarketStats.platformFee ?? 0.015) * 100).toFixed(2)}%)
                        </p>
                        <p className="text-2xl font-extrabold text-white">
                          ${" "}
                          {Number(
                            selectedMarketStats.resolutionReport.fees?.total || 0,
                          ).toFixed(2)}
                        </p>
                        <p className="text-[9px] text-gray-400 mt-1">
                          Compras: ${Number(selectedMarketStats.resolutionReport.fees?.primaryBuy || 0).toFixed(2)} · Sell-back: ${Number(selectedMarketStats.resolutionReport.fees?.primarySell || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-win-bg border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-win-card border-b border-white/5">
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                              Usuario
                            </th>
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                              Lado
                            </th>
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">
                              Invertido
                            </th>
                            <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">
                              Cobrado
                            </th>
                            <th className="p-4 text-[9px] font-bold text-white uppercase tracking-wider text-right bg-white/5">
                              P&amp;L USUARIO
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {selectedMarketStats.resolutionReport.positions.map(
                            (pos: any) => {
                              const userPnL = pos.payout - pos.amount;
                              const isWinner = pos.payout > 0 && userPnL > 0;
                              const isLoser = pos.payout === 0;
                              return (
                                <tr key={pos.id} className="hover:bg-white/5">
                                  <td className="p-4 text-xs font-bold text-white">
                                    @{pos.currentOwner}
                                  </td>
                                  <td className="p-4">
                                    <span
                                      className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${
                                        pos.side === "YES"
                                          ? "text-primary bg-primary/5"
                                          : "text-win-error bg-win-error/5"
                                      }`}
                                    >
                                      {pos.side}
                                    </span>
                                  </td>
                                  <td className="p-4 text-sm font-bold text-white/40 text-right">
                                    $ {pos.amount.toFixed(2)}
                                  </td>
                                  <td className={`p-4 text-sm font-bold text-right ${isWinner ? "text-primary" : "text-gray-500"}`}>
                                    {isLoser ? "–" : `$ ${pos.payout.toFixed(2)}`}
                                  </td>
                                  <td
                                    className={`p-4 text-sm font-black text-right bg-white/[0.02] ${isWinner ? "text-primary" : "text-win-error"}`}
                                  >
                                    {isWinner ? "+" : ""}
                                    {isLoser ? `– $ ${pos.amount.toFixed(2)}` : `$ ${userPnL.toFixed(2)}`}
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
                <div className="bg-win-bg border border-white/5 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-win-card border-b border-white/5">
                        <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Usuario
                        </th>
                        <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                          Opción
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
                              <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-white/10 text-white">
                                {p.outcome || p.side}
                              </span>
                            </td>
                            <td className="p-4 text-sm font-extrabold text-white">
                              $ {Number(p.amount || 0).toFixed(2)}
                            </td>
                            <td className="p-4 text-xs font-bold text-primary">
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
                className="w-full h-14 bg-win-bg border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-primary transition-all"
                value={newMarket.question}
                onChange={(e) =>
                  setNewMarket({ ...newMarket, question: e.target.value })
                }
                placeholder="¿Ej: Argentina ganará el mundial?"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                Fecha y Hora de Resolución <span className="text-gray-500 normal-case">(Argentina · UTC-3)</span>
              </label>
              <DateTimePicker
                value={newMarket.resolutionDate}
                onChange={(v) => setNewMarket({ ...newMarket, resolutionDate: v })}
                placeholder="Seleccionar fecha y hora"
              />
            </div>
            {/* LS-LMSR: liquidez dinámica b(Q) = max(b_min, α·Q) */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider px-1">
                ⚡ LS-LMSR — b(Q) = max(b_min, α·Q)
              </label>
              <p className="text-[9px] text-gray-500 px-1">
                El mercado se auto-profundiza con el volumen. Seed ≈ ${(parseFloat(newMarket.bMin || "1000") * 0.693).toFixed(0)}.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider px-1">
                  α (slope)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  className="w-full h-14 bg-win-bg border border-purple-500/20 rounded-2xl px-4 text-white font-bold outline-none focus:border-purple-500 transition-all"
                  value={newMarket.alpha}
                  onChange={(e) => setNewMarket({ ...newMarket, alpha: e.target.value })}
                  placeholder="0.15"
                />
                <p className="text-[9px] text-gray-500 px-1 mt-1">
                  0.05 conservador · 0.10 medio · 0.15 recomendado
                </p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider px-1">
                  b_min (piso)
                </label>
                <input
                  type="number"
                  className="w-full h-14 bg-win-bg border border-purple-500/20 rounded-2xl px-4 text-white font-bold outline-none focus:border-purple-500 transition-all"
                  value={newMarket.bMin}
                  onChange={(e) => setNewMarket({ ...newMarket, bMin: e.target.value })}
                  placeholder="1000"
                />
                <p className="text-[9px] text-gray-500 px-1 mt-1">
                  Subsidio inicial = b_min · ln(N outcomes)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  CAP Transacción ($)
                </label>
                <input
                  type="number"
                  className="w-full h-14 bg-win-bg border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-primary transition-all"
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
                  className="w-full h-14 bg-win-bg border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-primary transition-all"
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

            {/* Opciones de Probabilidad y Outcomes */}
            <div className="space-y-4 pt-2 border-t border-white/5">
              <div className="flex gap-2 p-1 bg-[#0d0d0d] rounded-2xl">
                <button
                  type="button"
                  onClick={() => setNewMarket({ ...newMarket, marketType: "BINARY" })}
                  className={`flex-1 py-3 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                    newMarket.marketType === "BINARY"
                      ? "bg-white/10 text-white shadow"
                      : "text-gray-500 hover:text-white"
                  }`}
                >
                  Binario (YES/NO)
                </button>
                <button
                  type="button"
                  onClick={() => setNewMarket({ ...newMarket, marketType: "MULTIPLE" })}
                  className={`flex-1 py-3 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                    newMarket.marketType === "MULTIPLE"
                      ? "bg-white/10 text-white shadow"
                      : "text-gray-500 hover:text-white"
                  }`}
                >
                  Múltiple (N Outcomes)
                </button>
              </div>

              {newMarket.marketType === "BINARY" ? (
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
              ) : (
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">
                    Opciones del Mercado (Múltiple)
                  </label>
                  {newMarket.outcomes.map((outcome, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        className="flex-1 h-12 bg-win-bg border border-white/5 rounded-xl px-4 text-white font-bold outline-none focus:border-primary transition-all text-xs"
                        value={outcome.name}
                        onChange={(e) => {
                          const newOutcomes = [...newMarket.outcomes];
                          newOutcomes[idx].name = e.target.value;
                          setNewMarket({ ...newMarket, outcomes: newOutcomes });
                        }}
                        placeholder={`Nombre Opción ${idx + 1}`}
                      />
                      <div className="relative w-24">
                        <input
                          type="number"
                          className="w-full h-12 bg-win-bg border border-white/5 rounded-xl pl-4 pr-6 text-white font-bold outline-none focus:border-primary transition-all text-xs"
                          value={outcome.probability}
                          onChange={(e) => {
                            const newOutcomes = [...newMarket.outcomes];
                            newOutcomes[idx].probability = e.target.value;
                            setNewMarket({ ...newMarket, outcomes: newOutcomes });
                          }}
                          placeholder="%"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">%</span>
                      </div>
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/5 shrink-0">
                        <input
                          type="color"
                          className="absolute -inset-2 w-16 h-16 cursor-pointer"
                          value={outcome.color || "#60a5fa"}
                          onChange={(e) => {
                            const newOutcomes = [...newMarket.outcomes];
                            newOutcomes[idx].color = e.target.value;
                            setNewMarket({ ...newMarket, outcomes: newOutcomes });
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newOutcomes = newMarket.outcomes.filter((_, i) => i !== idx);
                          setNewMarket({ ...newMarket, outcomes: newOutcomes });
                        }}
                        className="h-12 w-12 bg-win-error/10 text-win-error rounded-xl font-bold flex items-center justify-center hover:bg-win-error/20"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewMarket({
                          ...newMarket,
                          outcomes: [...newMarket.outcomes, { name: "", probability: "10", color: "#60a5fa" }]
                        });
                      }}
                      className="flex-1 py-3 border border-dashed border-white/20 rounded-xl text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:border-white/50 hover:text-white transition-all"
                    >
                      + Agregar Opción
                    </button>
                    <div className="py-3 px-4 bg-win-bg border border-white/5 rounded-xl text-[10px] font-bold text-gray-400 flex items-center gap-2">
                      Suma total: 
                      <span className={`text-sm ${
                        Math.abs(newMarket.outcomes.reduce((a, c) => a + parseFloat(c.probability || "0"), 0) - 100) < 0.01 
                          ? "text-primary" 
                          : "text-win-error"
                      }`}>
                        {newMarket.outcomes.reduce((a, c) => a + parseFloat(c.probability || "0"), 0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="w-full h-16 bg-primary text-win-bg text-xs font-bold uppercase tracking-[0.1em] rounded-2xl transition-all hover:scale-[1.02] shadow-xl shadow-primary/10"
          >
            {creating ? "Creando..." : "Lanzar Mercado"}
          </button>
        </div>
      </Modal>

      {/* Pause Primary Market Modal */}
      <Modal
        isOpen={!!pauseModal}
        onClose={() => { setPauseModal(null); setPauseScheduledAt(""); }}
        title="Pausar Mercado Primario"
      >
        {pauseModal && (
          <div className="space-y-6 pt-4">
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
              <p className="text-xs font-bold text-orange-400 mb-1">¿Qué ocurre al pausar?</p>
              <p className="text-[11px] text-gray-400">
                Los usuarios <span className="text-white font-bold">no podrán comprar posiciones nuevas</span> en el mercado.
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Mercado</p>
              <p className="text-sm font-bold text-white">{pauseModal.name}</p>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipo de pausa</p>

              <button
                onClick={() => handlePausePrimary(pauseModal.id)}
                className="w-full py-3 bg-orange-500 text-white text-xs font-bold rounded-xl uppercase tracking-wider hover:bg-orange-600 transition-all"
              >
                ⏸ Pausar ahora (manual)
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">o programar</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Pausar automáticamente en:
                </label>
                <input
                  type="datetime-local"
                  value={pauseScheduledAt}
                  onChange={(e) => setPauseScheduledAt(e.target.value)}
                  className="w-full bg-win-card border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500/50"
                />
                <button
                  onClick={() => pauseScheduledAt && handlePausePrimary(pauseModal.id, pauseScheduledAt)}
                  disabled={!pauseScheduledAt}
                  className="w-full py-3 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs font-bold rounded-xl uppercase tracking-wider hover:bg-yellow-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ⏱ Programar pausa
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!showResolveModal}
        onClose={() => setShowResolveModal(null)}
        title="Resolver Resultado Final"
      >
        {showResolveModal && (
          <div className="space-y-8 pt-4">
            <div className="bg-win-bg p-6 rounded-2xl border border-white/5 text-center">
              <p className="text-lg font-bold text-white mb-4">
                {showResolveModal.question}
              </p>
              <div className="flex justify-center gap-6 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex-wrap">
                {showResolveModal.outcomes?.map((o: any) => (
                  <span key={o.id}>
                    {o.name}: {Number((o.qOutstanding || 0)).toFixed(0)} sh
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {showResolveModal.outcomes?.map((o: any) => (
                <button
                  key={o.id}
                  onClick={() => handleResolve(o.id)}
                  disabled={resolving}
                  className="h-16 bg-primary text-win-bg text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {resolving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-win-bg border-t-transparent" />
                  ) : (
                    `${o.name} GANA`
                  )}
                </button>
              ))}
              <button
                onClick={() => handleResolve("VOID")}
                disabled={resolving}
                className="h-16 bg-white/5 text-gray-400 text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 col-span-full md:col-span-1"
              >
                {resolving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                ) : (
                  "Anular (VOID)"
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit Market Modal ─────────────────────────── */}
      <Modal
        isOpen={!!editingMarket}
        onClose={() => setEditingMarket(null)}
        title="Editar Mercado"
        size="2xl"
      >
        {editingMarket && (
          <form onSubmit={handleUpdateMarket} className="space-y-5 pt-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Pregunta</label>
              <textarea
                value={editingMarket.question}
                onChange={e => setEditingMarket((m: any) => ({ ...m, question: e.target.value }))}
                rows={3}
                required
                className="w-full bg-win-bg border border-white/10 rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 resize-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Descripción</label>
              <textarea
                value={editingMarket.description}
                onChange={e => setEditingMarket((m: any) => ({ ...m, description: e.target.value }))}
                rows={4}
                className="w-full bg-win-bg border border-white/10 rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 resize-none"
                placeholder="Descripción opcional..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Fecha de Resolución <span className="text-gray-500 normal-case">(Argentina · UTC-3)</span></label>
                <DateTimePicker
                  value={editingMarket.resolutionDate}
                  onChange={(v) => setEditingMarket((m: any) => ({ ...m, resolutionDate: v }))}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Deporte / Categoría</label>
                <select
                  value={editingMarket.sport}
                  onChange={e => setEditingMarket((m: any) => ({ ...m, sport: e.target.value }))}
                  className="w-full bg-win-bg border border-white/10 rounded-xl px-3.5 py-2.5 text-[13px] text-white focus:outline-none focus:border-primary/50"
                >
                  <option value="futbol">Fútbol</option>
                  <option value="baloncesto">Baloncesto</option>
                  <option value="beisbol">Béisbol</option>
                  <option value="tenis">Tenis</option>
                  <option value="formula1">Fórmula 1</option>
                  <option value="criquet">Criquet</option>
                  <option value="otros">Otros</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingMarket(null)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-gray-300 uppercase tracking-wider transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-xl text-[11px] font-bold text-primary uppercase tracking-wider transition-all"
              >
                Guardar Cambios
              </button>
            </div>
          </form>
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
