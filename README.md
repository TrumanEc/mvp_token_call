# WIN Sports Market - P2P Predictions MVP

Mercado P2P de predicciones deportivas con mercado secundario para trading de posiciones.

## 🎯 Features

- **Mercado Primario**: Usuarios crean posiciones YES/NO en mercados activos
- **Mercado Secundario**: Compra/venta de posiciones antes de resolución
- **Odds Dinámicos**: Actualizados en tiempo real según el pool
- **Settlement Automático**: Distribución de pagos al resolver mercados
- **Admin Panel**: Crear mercados, resolver outcomes, ver analytics

## 🛠️ Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: Simple username-based (MVP)

## 📦 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd wsm-predictions

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Setup database
npx prisma migrate dev
npx prisma db seed

# Run development server
npm run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/wsm_predictions"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## 🗄️ Database Schema

### Models

- **User**: Usuarios con balance y roles (USER/ADMIN)
- **Market**: Mercados de predicción (jugador, pregunta, pools YES/NO)
- **Position**: Posiciones de apuesta (lado, monto, estado)
- **MarketplaceListing**: Listings del mercado secundario
- **PositionTransfer**: Historial de transferencias
- **Transaction**: Historial de balance

### Key Relationships

```
User -> Position (owner)
Market -> Position -> MarketplaceListing
Position -> PositionTransfer (audit trail)
User -> Transaction (balance history)
```

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── markets/       # CRUD markets + resolve
│   │   ├── positions/     # Create/list positions
│   │   ├── marketplace/   # Secondary market
│   │   └── users/         # User management
│   ├── admin/             # Admin panel
│   ├── markets/           # Market pages
│   ├── marketplace/       # Secondary market UI
│   └── positions/         # User positions
├── components/            # React components
│   ├── layout/           # Shell, navigation
│   ├── markets/          # MarketCard, PlaceBetForm
│   ├── marketplace/      # ListingCard
│   ├── positions/        # PositionCard
│   └── ui/               # Button, Card, Modal, Input
├── contexts/             # React contexts (UserContext)
├── lib/                  # Utilities (prisma client)
├── services/             # Business logic
│   ├── odds-calculator.ts
│   ├── balance.ts
│   ├── market.ts
│   ├── position.ts
│   ├── listing.ts
│   ├── settlement.ts
│   └── user.ts
└── types/                # TypeScript types
```

## 🔧 API Endpoints

### Markets
- `GET /api/markets` - List markets (filter by status)
- `POST /api/markets` - Create market (admin)
- `GET /api/markets/[id]` - Get market details
- `PATCH /api/markets/[id]` - Activate/close market
- `POST /api/markets/[id]/resolve` - Resolve market (YES/NO/VOID)
- `GET /api/markets/[id]/resolve` - Get settlement report

### Positions
- `GET /api/positions?userId=X` - Get user positions
- `POST /api/positions` - Create position (place bet)
- `GET /api/positions/[id]` - Get position details
- `POST /api/positions/[id]/list` - List for sale

### Marketplace
- `GET /api/marketplace` - Get active listings
- `POST /api/marketplace/buy/[listingId]` - Buy position

### Users
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `GET /api/users/[username]` - Get user by username

## 💰 Business Logic

### Odds Calculation
```typescript
yesOdds = yesPool / totalPool * 100
noPayout = (totalPool * (1 - platformFee)) / noPool
```

### Fair Value (for secondary market)
```typescript
fairValue = potentialPayout * 0.95  // 5% liquidity discount
maxAskPrice = fairValue * 1.20      // Max 120% of fair value
```

### Fees
- **Primary Market**: 10% platform fee on resolution
- **Secondary Market**: 2.5% on each trade

## 🎮 User Flows

### 1. Place a Bet
1. Select market
2. Choose YES or NO
3. Enter amount
4. Confirm → Position created, balance deducted

### 2. Sell Position
1. Go to "Mis Posiciones"
2. Click "Vender en Marketplace"
3. Set ask price (max 120% fair value)
4. Confirm → Listed in marketplace

### 3. Buy from Marketplace
1. Browse marketplace
2. View ROI and potential return
3. Click "Comprar"
4. Confirm → Position transferred, balances updated

### 4. Admin: Resolve Market
1. Go to Admin panel
2. Select market to resolve
3. Choose outcome: YES, NO, or VOID
4. Confirm → Payouts distributed

## 🧪 Seed Data

Default users:
- `admin` - $10,000 (ADMIN role)
- `juan_futbol` - $1,000
- `maria_sports` - $1,000
- `pedro_trader` - $1,000
- `carlos_bet` - $1,000

Default markets:
- Alexis Mac Allister transfer (ACTIVE)
- Emiliano Martínez transfer (ACTIVE)
- Enzo Fernández transfer (DRAFT)

## 🚀 Deployment

### Vercel (Recommended)
```bash
npm run build
vercel deploy
```

### Docker
```dockerfile
# Coming soon
```

## 📝 TODO / Next Steps

- [ ] Real-time updates with WebSocket/Socket.io
- [ ] Proper authentication (NextAuth/Clerk)
- [ ] Mobile responsive improvements
- [ ] Price history charts
- [ ] Notifications
- [ ] More market types (multi-outcome)

## 📄 License

MIT

---

Built with 🏆 by WIN Sports Market Team
