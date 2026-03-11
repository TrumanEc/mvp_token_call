# Plan de Implementación: Mercado Secundario (Híbrido LMSR + Orderbook)

## 1. Arquitectura y Modelado de Datos

Actualmente, el modelo `MarketplaceListing` está diseñado principalmente para que los usuarios publiquen (vendan) sus posiciones ("Asks"). Para soportar una experiencia completa tipo Polymarket (y poder colocar órdenes límite de compra), necesitamos unificar el concepto en un **On-Chain Orderbook** o su equivalente en la base de datos (Off-Chain matching con On-Chain settlement, o todo en base de datos para este MVP).

### Cambios en Prisma Schema (`prisma/schema.prisma`)

Se debe agregar un modelo de `Order` unificado (o extender `MarketplaceListing`) que soporte tanto compra como venta:

```prisma
enum OrderType {
  BUY
  SELL
}

model Order {
  id               String    @id @default(cuid())
  marketId         String
  userId           String
  side             String    // 'YES' o 'NO'
  type             OrderType // 'BUY' o 'SELL'

  // Si es SELL, debe bloquear una posición:
  positionId       String?   // Referencia a la posición desde donde salen los shares

  // Parámetros de la orden:
  pricePerShare    Float     // Precio límite (ej. 0.40)
  initialShares    Float     // Cantidad original de shares en la orden
  remainingShares  Float     // Cuántos shares faltan por llenarse
  totalLocked      Decimal?  // (Solo BUY) Saldo bloqueado en USD al colocar la orden

  // Campos de Auditoría / Debugging (Para Admin)
  simulatedPriceAtCreation  Float?    // Precio marginal de LMSR en el instante en que la orden se creó
  executionLog              Json?     // Detalles de cruzamiento (Matchings) y saltos entre LMSR/OB para trazar el "Best Buy" route.

  status           String    @default("OPEN") // OPEN, PARTIAL, FILLED, CANCELLED
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user             User      @relation(fields: [userId], references: [id])
  market           Market    @relation(fields: [marketId], references: [id])
  position         Position? @relation(fields: [positionId], references: [id])

  @@index([marketId, status])
  @@index([userId])
}

// Modelo Exclusivo para Auditoría y Monitoreo del Enrutador (Router)
model MarketRouterAuditLog {
  id              String   @id @default(cuid())
  marketId        String
  userId          String
  requestAmount   Decimal  // Dinero total ($) o Shares solicitados en origen
  side            String   // 'YES' o 'NO'
  executionType   String   // 'BEST_BUY', 'LIMIT_BUY', 'LIMIT_SELL'

  lmsrAllocated   Decimal  // Cuánto $ absorbió el LMSR
  lmsrSharesGenerated Float // Cuántos shares nuevos emitió el LMSR
  obAllocated     Decimal  // Cuánto $ fluyó P2P en el OrderBook
  obSharesBought  Float    // Cuántos shares se obtuvieron en secundaria P2P

  lmsrAveragePrice      Float // Precio promedio pagado en el LMSR
  obAveragePrice        Float // Precio promedio pagado en P2P
  finalAveragePricePaid Float // Combinado de ambas fuentes

  timestamp       DateTime  @default(now())

  market          Market    @relation(fields: [marketId], references: [id])
  user            User      @relation(fields: [userId], references: [id])

  @@index([marketId])
}
```

_Nota: Todas las transferencias P2P requerirán actualizar y dividir (`PositionService.split`) los shares en el modelo `Position` de los usuarios según se vayan ejecutando las órdenes._

---

## 2. Enrutador "Best Buy" (Compra de Mercado)

Este es el núcleo de la experiencia fluida. El usuario simplemente introduce que quiere comprar $100 de YES.
El servicio calculará el precio marginal del LMSR y revisará el Orderbook en bucle hasta agotar los $100.

**Algoritmo del Swapper/Router (Pseoducódigo):**

1. **Entrada**: `amount` ($ USD a gastar), `side` ('YES' o 'NO'), `marketId`.
2. **Setup**:
   - `budgetRestante = amount`
   - Obtener todas las órdenes `SELL` de 'YES' ordenadas por `pricePerShare` Ascendente (de más baratas a más caras).
3. **Bucle mientras `budgetRestante > 0`**:
   - Obtener precio marginal actual de LMSR: $P_{LMSR} = \frac{e^{q_i / b}}{e^{q_{yes}/b} + e^{q_{no}/b}}$
   - Tomar el `mejor_ask` (orden SELL más barata) del Orderbook que siga abierta.
   - **Caso A: Orderbook es más barato** (`mejor_ask` existe y `mejor_ask.pricePerShare <= P_LMSR`)
     - Ejecutar contra la orden limit P2P.
     - Calcular cuánto podemos comprar: `coste_maximo = mejor_ask.remainingShares * mejor_ask.pricePerShare`.
     - Si `budgetRestante < coste_maximo`:
       - `sharesComprados = budgetRestante / mejor_ask.pricePerShare`
       - Restar los `shares` a la orden, cambiar dueño, transferir cash P2P de comprador a vendedor.
       - `budgetRestante = 0` (¡Terminamos!)
     - Si `budgetRestante >= coste_maximo`:
       - `sharesComprados = mejor_ask.remainingShares`
       - Marcar orden como `FILLED`. Transferir cash P2P de comprador a vendedor.
       - `budgetRestante -= coste_maximo`
   - **Caso B: LMSR es más barato** (`P_LMSR < mejor_ask.pricePerShare` o no hay `mejor_ask`)
     - Comprar desde el LMSR.
     - Aquí debemos tener cuidado de no agotar el `budgetRestante` de golpe si el precio del LMSR subiría por encima del Orderbook.
     - **Técnica de iteración segura**: Determinar cuánto capital podemos gastar en el LMSR hasta que el precio marginal de LMSR sea igual a `mejor_ask.pricePerShare`.
     - Si el coste de llegar a ese precio sobrepasa el `budgetRestante`, invertimos todo el `budgetRestante` en LMSR.
     - Si el coste es menor, invertimos eso en LMSR, se actualiza `P_LMSR` (que ahora es igual al `mejor_ask`), y el bucle continúa (lo que hará que el siguiente paso compre del Orderbook).
     - Actualizar `qYes`, `qNo`, y reducir `budgetRestante`.
4. **Cierre**: Actualizar saldo del comprador, generar registro de transacciones (mezcla de _P2P Trades_ y _LMSR Minting_).

---

## 3. Compra con Orden Límite (Limit Buy)

Cuando un usuario quiere fijar un techo (ej. "Quiero comprar $100 en YES a $0.40 o menos"):

1. **Validación**: Esta orden **nunca** minteará del LMSR (porque el LMSR ejecuta a precio spot/mercado continuo y sufre slippage, no permite fijar precios límite de entrada).
2. **Matching Inmediato**:
   - Mismo principio que el _Router_: Revisar si hay un `SELL` abierto a $\leq 0.40$ en el Orderbook.
   - Si es así, cruzar la orden parcialmente (P2P Trade transferiendo posición) hasta llenar la petición o limpiar ese nivel de precio.
3. **Colocar al Orderbook**:
   - Si quedó parte de los $100 sin gastar y ningún `SELL` coincide, se crea una entidad `Order` de tipo `BUY` por el monto restante a precio `$0.40`.
   - **Crítico**: Se deben bloquear los fondos (`user.balance -= resto`). Si la orden se cancela luego en interfaz, se regresan al saldo líquido.

---

## 4. Venta y Cash-Out (Limit Sell)

Cuando un usuario quiere salir de su posición y asegurar ganancias o cortar pérdidas (ej. tiene 100 shares YES y quiere vender todo a $0.60):

1. **Validación**: Verificar que el usuario sea dueño de los 100 shares mediante el modelo `Position`.
2. **Matching Inmediato**:
   - Revisar si hay una orden de compra (`BUY LIMIT order`) abierta dispuesta a pagar $\geq 0.60$.
   - Ejecutar el trade inmediatamente transfiriendo el dinero subyacente del comprador (que ya estaba bloqueado) al vendedor, y separando los shares al comprador (usando `PositionService.split`).
3. **Colocar en el Orderbook**:
   - Si sobran shares por venderse que no fueron matched, crear el registro `Order` tipo `SELL` ligado a la posición (bloqueando esos shares para que no puedan enviarse o venderse doblemente mientras la orden exista).
   - _Nota Importante_: "El LMSR emite, el orderbook transa". El LMSR no actúa como un Liquidity Provider Automático (AMM Constante) que recompra shares. El vendedor solo podrá salir cuando otro usuario P2P tome sus shares.

---

## 5. Dinámica y Adopción en Producción (Día 1 vs Escala)

**El Techo Natural del LMSR**
El Frontend deberá calcular el precio _Spot_ mostrado a los usuarios, el cual siempre será el `min(P_LMSR, P_MejorAsk_OB)`.
Nadie racional comprará en el OB a un precio superior al que el LMSR puede mintearle shares frescos. El Router Best Buy garantiza esa protección de forma matemática y autónoma.

**Adopción Temprana (Día 1 / Escasez de liquidez)**
Todo funciona perfectamente:

- El Orderbook (OB) arrancará en blanco.
- Cuando los usuarios presionen "Comprar (Best Buy)", el _Router_ simplemente verá que no hay órdenes en el OB. `P_LMSR` es la única opción y todo el `budgetRestante` se irá al minteo primario. Es idéntico a la V1.
- A medida que quieran salir, insertarán órdenes en el OB. Y orgánicamente, los próximos compradores tomarán esas salidas antes de tocar el LMSR si el precio es competitivo.

---

## 6. Siguientes Pasos de Acción / Plan de Trabajo

### Fase 1: Base de Datos y Lógica LMSR Avanzada

1. **Prisma**: Reemplazar `MarketplaceListing` por `Order`. Generar Migración y Script para mantener vivos los listings actuales.
2. **Matemática LMSR Inversa**: Crear función en `LmsrService` que dado un precio objetivo, devuelva la cantidad máxima de capital que se puede inyectar hasta alcanzar ese precio (fundamental para que el _Router_ sepa cuándo parar de mintear y saltar al OB).

### Fase 2: Motor de Emparejamiento (Matching Engine)

3. **OrderBookService**: Implementar `createLimitBuy`, `createLimitSell` y la lógica recursiva de `matchOrders()`.
4. **Integración con Saldos**: Separar concepto de `balance` y `lockedBalance` en la base de datos o lógica de negocio.

### Fase 3: Gateway Híbrido y API

5. **RouterService**: Crear el servicio de "Compra al Mercado" (Best Buy) implementando el bucle iterativo que decide entre P_LMSR o P_OB.
6. **Endpoints API**: Unificar los endpoints de `/markets/[id]/buy` y `/marketplace` en uno solo más robusto (ej: `/api/orders` soportando tipo `MARKET` o `LIMIT`).

### Fase 4: Experiencia de Usuario (UI/UX)

7. **Refactorización de Modales de Trading**: Separar el componente visual de Swap en pestañas tipo Exchange (Market vs Limit).
8. **Visualización**: Incorporar visualmente la "profundidad del mercado" y un log público del Orderbook ("Últimos trades / Spread").

### Fase 5: Auditoría, Testing y Herramientas Admin (Beta Tracker)

9. **Simulaciones Admin**: Crear un simulador de órdenes en el dashboard de administración. Poder inyectar dinero asíncrono o mockear órdenes, visualizando en tiempo real el comportamiento algorítmico del cruce (LMSR vs OB) sin afectar balances productivos.
10. **Panel de Auditoría de Enrutador**: Panel/Vista en el Dashboard Admin que lea de la tabla `MarketRouterAuditLog` para validar que el *Best Buy* verdaderamente esté otorgando al usuario el precio óptimo matemático en cada transacción híbrida. Visualizar la distribución de liquidez del *trade* (`[70% OB | 30% LMSR]`, por ejemplo).
