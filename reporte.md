# Reporte del Proyecto: WIN Sports Market (MVP)

Este documento proporciona una visión detallada de la arquitectura, lógica de negocio y funcionalidades del sistema de predicciones P2P.

## 1. Estructura del Proyecto

El proyecto está construido sobre un framework moderno y escalable.

- **Frontend/Backend**: Next.js 14+ (App Router) con TypeScript.
- **ORM**: Prisma para la gestión de la base de datos.
- **Base de Datos**: PostgreSQL (en producción) / SQLite (en desarrollo local).
- **Estilos**: Tailwind CSS.
- **Servicios**: Lógica desacoplada en `src/services/`.

### Estructura de Archivos Principal:
- `src/app/`: Rutas de la aplicación (UI y API).
- `src/services/`: Lógica central (Odds, Balances, Mercados, Posiciones, Listings, Settlement).
- `src/components/`: Componentes reutilizables de UI (Markets, Marketplace, Positions, UI base).
- `prisma/schema.prisma`: Definición de modelos de datos.

---

## 2. Lógica de Mercado y Negocio

El sistema opera bajo un modelo de **Mercado P2P de Predicciones** con dos capas:

### Mercado Primario
Los usuarios interactúan directamente con el contrato/sistema para crear posiciones "YES" o "NO" en un mercado activo. 
- **Pools**: Cada mercado mantiene pools separados para YES y NO.
- **Market Cap**: Cada mercado tiene un límite máximo (`maxPool`). Una vez alcanzado, solo se puede entrar a través del mercado secundario.

### Mercado Secundaria (Marketplace)
Permite a los usuarios vender sus posiciones activas antes de que se resuelva el mercado.
- **Venta Fraccional**: Los usuarios pueden vender una porción de su posición, no necesariamente el total.
- **Listings**: Las posiciones en venta se listan con un precio solicitado (`askPrice`).

---

## 3. Ecuaciones y Cálculos

El sistema utiliza las siguientes fórmulas para determinar el estado financiero de cada mercado:

### Probabilidades (Odds)
```typescript
yesOdds = (yesPool / totalPool) * 100
noOdds = (noPool / totalPool) * 100
```

### Pagos (Payouts)
Se aplica un **Fee de Plataforma (10%)** sobre el pool total antes de la distribución.
```typescript
netPool = totalPool * (1 - platformFee)
payout = netPool / sidePool
// Ejemplo: Si apuestas en YES, tu pago potencial es (totalPool * 0.9) / yesPool
```

### Acciones (Shares) y Precio de Compra
Para permitir el trading secundario, las posiciones se convierten a "shares":
```typescript
purchasePrice = initialProbability / 100
shares = amount / purchasePrice
// Cada share vale $1 si la predicción es correcta y $0 si es incorrecta.
```

### Valor de Mercado (Fair Value)
Utilizado para sugerir precios en el Marketplace:
```typescript
fairValue = shares * currentPrice * 0.95 // 5% de descuento por liquidez
maxAskPrice = fairValue * 1.20           // Límite de precio para evitar spam/precios locos
```

---

## 4. Eventos Principales

1. **Creación de Mercado**: Un Administrador crea un mercado en estado `DRAFT`.
2. **Activación**: El mercado pasa a `ACTIVE` y comienza a recibir predicciones.
3. **Colocación de Apuesta**: El usuario elige un lado, se deduce su balance, se actualizan los pools y se calculan sus *shares*.
4. **Listado en Marketplace**: El usuario pone en venta su posición (o parte de ella).
5. **Compra en Marketplace**: Un comprador adquiere shares de otro usuario. Se transfieren los fondos y la propiedad de la posición.
6. **Resolución de Mercado**: Un Administrador define el resultado (`YES`, `NO`, o `VOID`).
7. **Settlement (Liquidación)**: El sistema distribuye los pagos a los ganadores según sus shares y procesa la comisión de la plataforma.

---

## 5. Tipos de Usuarios

### 1. Usuario (Investor/Trader)
- **Perfil**: Comprador de predicciones y trader.
- **Acciones**:
    - Ver mercados activos y cerrados.
    - Realizar predicciones (Bets) en el mercado primario.
    - Comprar y vender posiciones en el mercado secundario.
    - Gestionar su propio balance y perfil.

### 2. Administrador
- **Perfil**: Gestor de la plataforma.
- **Acciones**:
    - Crear, editar y activar mercados.
    - Resolver mercados (declarar ganadores).
    - Ver reportes de liquidación (Settlement reports).
    - Gestionar la configuración global (fees, límites).

---

## 6. Funcionalidades Detalladas

### Funcionalidades Generales
- **Sistema de Balances**: Créditos y débitos automáticos con historial de transacciones.
- **Historial de Precios**: Registro de la evolución de las probabilidades en cada mercado.
- **Odds Dinámicos**: Actualización en tiempo real (según lógica de pools).

### Funcionalidades por Usuario
- **Exploración de Mercados**: Filtros por estado y búsqueda.
- **Dashboard de Posiciones**: Vista detallada de ROI, Profit/Loss y valor actual de sus inversiones.
- **Marketplace**: Filtros por ROI potencial y lado de la apuesta.
- **Fraccionamiento**: Capacidad de dividir una inversión para vender solo una parte.

### Funcionalidades de Admin
- **Panel de Control**: Interfaz para gestionar el ciclo de vida de los eventos deportivos.
- **Lógica de Arbitraje**: Herramientas para resolver resultados basados en fuentes oficiales.

---

## 7. Tipo de Mercado

**P2P Prediction Market con Mecanismo de Parimutuel Híbrido.**

- **No es un Bookmaker**: El precio no lo pone una casa de apuestas, sino el balance de dinero entre los participantes ("The Crowd").
- **Híbrido**: Combina el modelo clásico de pool (Parimutuel) con un mercado secundario de órdenes que permite salir de la posición antes del evento, similar a un exchange de acciones o tokens.
- **Capacitado para el Mercado Secundario**: A diferencia de las apuestas tradicionales, las posiciones son activos transferibles que pueden generar ganancias por apreciación de precio sin esperar al resultado final.
