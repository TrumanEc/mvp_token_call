# Design Docs — Prediction Markets MVP

Documentación de referencia para migrar este MVP al stack principal de WIN
(`api.win.investments` + `win-field` + `dashboard-win`).

> **Última actualización**: post-cleanup completo del modelo.
> El sistema ahora es **LS-LMSR multi-outcome sin P2P**: el único motor de
> compra es mint contra la curva, el único motor de venta es burn contra la
> curva (sell-back LMSR). No hay orderbook, no hay marketplace de listings.

---

## Índice

### 1. [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)
**Empezar acá.** Plan paso a paso del MVP al backend `api.win.investments`.
10 fases mergeables independientemente, con prompts pre-fabricados para usar
con IA, acceptance criteria por fase, y checklist final de cutover.

### 2. [REAL_TIME_ARCHITECTURE.md](./REAL_TIME_ARCHITECTURE.md)
Las 4 mejoras post-MVP para que la experiencia sea rápida y fresca:
cache Redis, WebSocket con pub/sub, idempotency keys, BullMQ write-behind.
Con código de ejemplo, antipatrones, y orden por ROI.

### 3. [TESTING_PLAYBOOK.md](./TESTING_PLAYBOOK.md)
Tests por fase, load testing con k6, runbooks de incidente. Énfasis en
**tests de paridad LMSR**: cada función matemática del backend devuelve el
mismo número que el MVP validado, hasta 6 decimales.

---

## Modelo de dominio final (snapshot 2026-06-04)

### Únicas vías de movimiento de shares

| Operación | Endpoint | Lógica |
|---|---|---|
| **Comprar** | `POST /predictionPositions` | LMSR mint: el usuario paga `gross`, se descuenta fee `gross · platformFee`, se mintean `shares = sharesForBudget(qVector, netInvestment)` |
| **Vender** | `POST /predictionPositions/:id/sell-lmsr` | LMSR burn: el usuario quema `N shares`, el sistema devuelve `revenue · (1 − platformFee)` |

No hay orderbook, no hay listings P2P. Cada trade modifica directamente
`PredictionMarketOutcome.qOutstanding` y `PredictionMarket.totalPool`.

### Liquidez

**LS-LMSR (liquidity-sensitive)** es el único motor:
- `b(Q) = max(b_min, α · Q)` donde `Q = Σ q_i`
- Defaults: **α = 0.15**, **b_min = 1000**
- Ambos campos `NOT NULL` en DB con esos defaults
- El `b` raw del schema queda como compat pero la liquidez efectiva es siempre
  `effectiveB = lmsr.getEffectiveBN(qVector, params)`

### Settlement

- Markets con `status IN ('ACTIVE', 'CLOSED')` se pueden resolver
- `winningOutcomeId` decide; `"VOID"` refunda `totalCost` a cada ACTIVE position
- `payoutPerShare = totalPool / Σ winningShares` (pro-rata)
- Fees del ciclo viven en `PredictionTransaction` (no en el report) — se
  reconstruyen con `Σ (position.amount − totalCost)` + sumando fees parseados
  de las descripciones de transactions `POSITION_SOLD`

---

## Estructura del repo (snapshot)

```
mvp_token_call/
├── apps/                          ← Espejo de api.win.investments
│   ├── api/src/
│   │   ├── admins/{markets, users, transactions, inactive-markets}/
│   │   ├── markets/, positions/, users/, auth/
│   │   ├── guards/auth/
│   │   └── common/
│   ├── prediction-app/src/
│   │   ├── lmsr/          ← LS-LMSR multi-outcome puro
│   │   ├── markets/       ← lifecycle + read aggregation
│   │   ├── positions/     ← create (LMSR mint) + read aggregation
│   │   └── settlement/    ← resolve + report con fees reconstruidos
│   ├── wallet-user-app/src/
│   │   ├── balance/       ← deduct/credit + audit (TransactionType limpio)
│   │   ├── transactions/
│   │   └── users/
│   └── auth-app/src/
├── libs/common/src/                ← (a crearse durante la fase 1)
├── src/                            ← Next.js (UI + thin route wrappers)
│   ├── app/                        ← routes + páginas
│   ├── components/ui/DateTimePicker.tsx   ← componente nuevo con TZ Argentina
│   └── services/*.ts                       ← re-export shims hacia apps/
├── prisma/schema.prisma            ← Source de tipos (sin P2P)
└── design-docs/                    ← Esta carpeta
```

---

## Stack mapping

| Concepto | MVP | Backend target |
|---|---|---|
| ORM | Prisma | TypeORM 0.3 |
| DB | Postgres (Supabase) | MySQL |
| Auth | NextAuth + Cognito | Cognito JWT puro |
| HTTP | Next route handlers | NestJS `@Controller` |
| RPC interno | Imports directos | Redis `@MessagePattern` |
| Validación | zod + types | class-validator |
| Cache | Ninguna | Redis (`@nestjs/cache-manager`) |
| Real-time | Ninguna | Socket.io + Redis adapter |
| Jobs | Ninguna | BullMQ |
| Date picker | `react-day-picker@10` | idem (ya está en dashboard) |
| TZ | Argentina UTC-3 forzada | idem |

---

## Endpoints finales del backend

```
ADMIN (require AuthAdminGuard):
  POST   /admin/predictionMarkets
  GET    /admin/predictionMarkets
  GET    /admin/predictionMarkets/:id/stats         ← incluye effectiveB y Q
  PATCH  /admin/predictionMarkets/:id
  DELETE /admin/predictionMarkets/:id
  POST   /admin/predictionMarkets/:id/lmsr          ← editar b (raro, debug)
  GET    /admin/predictionMarkets/:id/lmsr-logs
  GET    /admin/predictionMarkets/inactive
  POST   /admin/predictionMarkets/inactive/recover
  GET    /admin/predictionTransactions
  PATCH  /admin/walletUsers/:id/role
  GET    /admin/walletUsers/:id/stats

PUBLIC + AUTH:
  GET    /predictionMarkets
  GET    /predictionMarkets/:id
  PATCH  /predictionMarkets/:id           (admin: activate/close/pause)
  POST   /predictionMarkets/:id/resolve   (admin)
  GET    /predictionMarkets/:id/resolve   (settlement report)
  GET    /predictionMarkets/:id/comments
  POST   /predictionMarkets/:id/comments    (auth + holder con shares)
  GET    /predictionMarkets/:id/snapshots
  GET    /predictionMarkets/:id/activity
  GET    /predictionMarkets/:id/state       (q-vector + prices + effectiveB)
  GET    /predictionMarkets/:id/price-quote (LMSR mint sim)
  GET    /predictionMarkets/:id/sell-quote  (LMSR burn sim)
  GET    /predictionPositions               (auth, filter by JWT.sub)
  POST   /predictionPositions               (auth)
  GET    /predictionPositions/:id           (auth)
  POST   /predictionPositions/:id/sell-lmsr (auth)
```

**Endpoints eliminados (P2P) — NO portar:**
- `~~/predictionOrders~~`
- `~~/predictionMarketplace~~`, `~~/predictionMarketplace/buy/:id~~`
- `~~/predictionPositions/:id/list~~`
- `~~/admin/predictionRouterLogs~~`, `~~/admin/predictionPurchases~~`

---

## TransactionType final

```ts
export type TransactionType =
  | 'BET_PLACED'        // LMSR mint
  | 'BET_REFUNDED'      // resolución VOID
  | 'PAYOUT_RECEIVED'   // ganador en resolución
  | 'POSITION_SOLD'     // LMSR sell-back
  | 'DEPOSIT'           // futuro: real money in
  | 'WITHDRAWAL';       // futuro: real money out
```

**Tipos eliminados** (eran P2P): `POSITION_PURCHASED`, `LIMIT_ORDER_PLACED`,
`LIMIT_ORDER_CANCELLED`.

---

## Modelos Prisma → entidades TypeORM

| MVP Prisma model | Backend TypeORM entity | Estado |
|---|---|---|
| `User` | `WalletUser` (existe) | rename solo en interface |
| `Market` | `PredictionMarket` (existe, binario) | **extender** a multi-outcome |
| `Position` | `PredictionPosition` (existe, binario) | extender |
| `MarketOutcome` | **NUEVO** `PredictionMarketOutcome` | crear |
| `LmsrSnapshot` | `PredictionLmsrSnapshot` (existe) | verificar |
| `Transaction` | `PredictionTransaction` (existe) | extender types |
| `MarketHistory` | `PredictionMarketHistory` (existe) | verificar |
| `MarketComment` | **NUEVO** `PredictionMarketComment` | crear |
| `PlatformConfig` | usar `configuration` general | merge |

**Modelos eliminados (P2P) — NO crear**:
- `~~Order~~`, `~~MarketplaceListing~~`, `~~PositionTransfer~~`,
  `~~MarketRouterAuditLog~~`, `~~OrderType (enum)~~`

---

## Cambios de UX importantes en el MVP

Estos no son del backend sino del cliente — para tenerlos presente al portar
a `dashboard-win`:

- **Zona horaria forzada Argentina (UTC-3)** en todos los inputs/outputs de
  fechas. Helpers `argDatetimeLocalToIso()` y `isoToArgDatetimeLocal()` en
  `src/app/admin/page.tsx` (mover a `lib/utils/datetime.ts` en la migración).
- **`DateTimePicker`** custom con `react-day-picker` + selector de hora.
  Componente en `src/components/ui/DateTimePicker.tsx`. Portear a
  `dashboard-win/components/ui/` o usar el equivalente shadcn.
- **Admin stats** ahora muestra `effectiveB` (LS-LMSR dinámico) y `Q`, no el
  `market.b` estático.
- **Reporte de resolución** muestra fees reales reconstruidos
  (`primaryBuy + primarySell`), no el campo `secondary` que existía con P2P.

---

## Decisiones clave que NO retroceden

1. **No P2P**. La liquidez del lado vendedor sale del AMM, no de
   contrapartes. Esto define el modelo de negocio: el AMM siempre cotiza,
   los usuarios siempre pueden salir.
2. **LS-LMSR únicamente**. Fixed-b LMSR fue removido del código y del
   schema; `alpha` y `bMin` son NOT NULL.
3. **Multi-outcome es first-class**. La N-outcome API del LMSR es la única
   pública; los wrappers binarios se borraron. Los markets binarios son N=2
   con outcomes `YES`/`NO`.
4. **IDs cuid en MVP → bigint en backend**. Mapping en data migration.

---

## Workflow recomendado de migración con IA

```
┌──────────────────────────────────────────────────────────────┐
│ Para cada fase del MIGRATION_PLAN.md:                        │
│                                                              │
│  1. Leer la fase                                             │
│  2. Cargar contexto en IA:                                   │
│     - este README                                            │
│     - REPO_STRUCTURE_backend.md                              │
│     - el archivo source del MVP                              │
│     - un ejemplo del backend del mismo tipo                  │
│  3. Usar el prompt pre-fabricado                            │
│  4. Generar código                                           │
│  5. Tests de TESTING_PLAYBOOK.md                             │
│  6. Marcar acceptance criteria                               │
│  7. Mergear                                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Repos relacionados

- **MVP**: `mvp_token_call` (este)
- **Backend**: `api.win.investments`
- **Webapp**: `win-field`
- **Dashboard**: `dashboard-win`

Para dudas sobre el modelo, ver los headers de comentarios en
`apps/prediction-app/src/*/` — cada service core tiene un header con
invariantes del dominio.
