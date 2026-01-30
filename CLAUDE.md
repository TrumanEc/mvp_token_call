# WSM Predictions MVP - Agent Context & Implementation Guide

## 🎯 Project Overview

**Project Name:** WIN Sports Market - P2P Predictions with Secondary Market  
**Stack:** Next.js 14+ (App Router), TypeScript, Prisma, PostgreSQL, Socket.io  
**Goal:** Build a real-time P2P prediction market where users can bet on player transfers and trade positions in a secondary market.

---

## 📋 Core Requirements

### Functional Requirements
1. **Multi-user system** - Multiple users can register and participate simultaneously
2. **Primary Market** - Users create positions (YES/NO bets) on active markets
3. **Secondary Market** - Users can list, buy, and sell positions before resolution
4. **Real-time updates** - Odds, prices, and market state update live for all users
5. **Admin Panel** - Create markets, resolve outcomes, view analytics
6. **Balance Management** - Users start with initial balance, spend on bets, receive payouts
7. **Settlement Reports** - Detailed results when markets close

### Technical Requirements
1. **Real-time** - WebSocket connections for live updates
2. **Concurrent transactions** - Handle multiple users trading simultaneously
3. **Optimistic locking** - Prevent double-sales and race conditions
4. **Type safety** - Full TypeScript coverage
5. **Database transactions** - ACID compliance for all money operations
6. **Responsive UI** - Works on desktop and mobile

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        NEXT.JS APP                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Public     │  │  Secondary   │  │    Admin     │    │
│  │   Routes     │  │   Market     │  │    Panel     │    │
│  │              │  │              │  │              │    │
│  │ /markets     │  │ /marketplace │  │ /admin       │    │
│  │ /positions   │  │ /sell        │  │ /resolve     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                      API ROUTES (/api)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /api/markets          → CRUD markets                       │
│  /api/positions        → Create/view positions              │
│  /api/marketplace      → Listings CRUD                      │
│  /api/marketplace/buy  → Purchase positions                 │
│  /api/admin            → Admin operations                   │
│  /api/socket           → WebSocket handler                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    BUSINESS LOGIC LAYER                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Services (src/services/)                             │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ • MarketService     → Market operations              │  │
│  │ • PositionService   → Position management            │  │
│  │ • ListingService    → Marketplace logic              │  │
│  │ • BalanceService    → User balance operations        │  │
│  │ • OddsCalculator    → Real-time odds calculation     │  │
│  │ • SettlementService → Market resolution & payouts    │  │
│  │ • ReportService     → Analytics & reports            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                      DATA ACCESS LAYER                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Prisma ORM + PostgreSQL                              │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Tables:                                              │  │
│  │ • users                                              │  │
│  │ • markets                                            │  │
│  │ • positions                                          │  │
│  │ • marketplace_listings                               │  │
│  │ • position_transfers                                 │  │
│  │ • transactions                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     REAL-TIME LAYER                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Socket.io Server                                     │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Events:                                              │  │
│  │ • market:updated      → Odds changed                 │  │
│  │ • listing:created     → New sale listing             │  │
│  │ • listing:sold        → Position sold                │  │
│  │ • market:resolved     → Market settled               │  │
│  │ • balance:updated     → User balance changed         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
wsm-predictions/
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Initial data (users, markets)
│   └── migrations/                # Database migrations
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (public)/
│   │   │   ├── markets/
│   │   │   │   ├── page.tsx       # Market list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx   # Market detail + bet
│   │   │   ├── marketplace/
│   │   │   │   └── page.tsx       # Secondary market
│   │   │   ├── positions/
│   │   │   │   └── page.tsx       # My positions
│   │   │   └── layout.tsx
│   │   ├── (admin)/
│   │   │   ├── admin/
│   │   │   │   ├── markets/
│   │   │   │   │   ├── page.tsx   # Manage markets
│   │   │   │   │   └── create/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── resolve/
│   │   │   │   │   └── page.tsx   # Resolve markets
│   │   │   │   └── reports/
│   │   │   │       └── page.tsx   # Analytics
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── markets/
│   │   │   │   ├── route.ts       # GET, POST markets
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts   # GET market
│   │   │   │       └── resolve/
│   │   │   │           └── route.ts
│   │   │   ├── positions/
│   │   │   │   ├── route.ts       # GET, POST positions
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── list/
│   │   │   │       │   └── route.ts
│   │   │   │       ├── update-price/
│   │   │   │       │   └── route.ts
│   │   │   │       └── cancel-sale/
│   │   │   │           └── route.ts
│   │   │   ├── marketplace/
│   │   │   │   ├── route.ts       # GET listings
│   │   │   │   └── buy/
│   │   │   │       └── [listingId]/
│   │   │   │           └── route.ts
│   │   │   ├── users/
│   │   │   │   └── [username]/
│   │   │   │       ├── route.ts   # User info
│   │   │   │       └── balance/
│   │   │   │           └── route.ts
│   │   │   └── socket/
│   │   │       └── route.ts       # WebSocket endpoint
│   │   ├── layout.tsx
│   │   └── page.tsx               # Landing/home
│   │
│   ├── components/
│   │   ├── markets/
│   │   │   ├── MarketCard.tsx
│   │   │   ├── MarketDetail.tsx
│   │   │   ├── PlaceBetModal.tsx
│   │   │   └── OddsDisplay.tsx
│   │   ├── positions/
│   │   │   ├── PositionCard.tsx
│   │   │   ├── PositionList.tsx
│   │   │   └── SellPositionModal.tsx
│   │   ├── marketplace/
│   │   │   ├── ListingCard.tsx
│   │   │   ├── ListingDetail.tsx
│   │   │   └── BuyModal.tsx
│   │   ├── admin/
│   │   │   ├── CreateMarketForm.tsx
│   │   │   ├── ResolveMarketForm.tsx
│   │   │   └── SettlementReport.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── Card.tsx
│   │       └── ... (shadcn/ui components)
│   │
│   ├── services/
│   │   ├── market.service.ts
│   │   ├── position.service.ts
│   │   ├── listing.service.ts
│   │   ├── balance.service.ts
│   │   ├── odds-calculator.service.ts
│   │   ├── settlement.service.ts
│   │   └── report.service.ts
│   │
│   ├── lib/
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── socket.ts              # Socket.io server
│   │   ├── validations.ts         # Zod schemas
│   │   └── utils.ts               # Helper functions
│   │
│   ├── hooks/
│   │   ├── useSocket.ts           # Socket connection hook
│   │   ├── useMarkets.ts          # Market data hook
│   │   ├── usePositions.ts        # Positions hook
│   │   └── useListings.ts         # Marketplace hook
│   │
│   ├── types/
│   │   ├── market.types.ts
│   │   ├── position.types.ts
│   │   ├── listing.types.ts
│   │   └── socket.types.ts
│   │
│   └── constants/
│       └── config.ts              # App configuration
│
├── public/
│   └── ... (static assets)
│
├── .env                           # Environment variables
├── .env.example
├── next.config.js
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

---

## 🗄️ Database Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================================
// USERS
// ============================================================================

model User {
  id        String   @id @default(cuid())
  username  String   @unique
  email     String?  @unique
  role      Role     @default(USER)
  balance   Decimal  @default(1000.00) @db.Decimal(10, 2)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  positions          Position[]
  sellListings       MarketplaceListing[]  @relation("SellerListings")
  purchases          MarketplaceListing[]  @relation("BuyerListings")
  transfersFrom      PositionTransfer[]    @relation("TransfersFrom")
  transfersTo        PositionTransfer[]    @relation("TransfersTo")
  transactions       Transaction[]

  @@index([username])
}

enum Role {
  USER
  ADMIN
}

// ============================================================================
// MARKETS
// ============================================================================

model Market {
  id              String        @id @default(cuid())
  playerName      String
  question        String
  description     String?
  status          MarketStatus  @default(DRAFT)
  outcome         Outcome?
  yesPool         Decimal       @default(0) @db.Decimal(12, 2)
  noPool          Decimal       @default(0) @db.Decimal(12, 2)
  platformFee     Decimal       @default(0.10) @db.Decimal(3, 2)  // 10%
  resolutionDate  DateTime
  resolvedAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Relations
  positions       Position[]
  listings        MarketplaceListing[]

  @@index([status])
  @@index([resolutionDate])
}

enum MarketStatus {
  DRAFT
  ACTIVE
  CLOSED
  RESOLVED
  VOIDED
}

enum Outcome {
  YES
  NO
}

// ============================================================================
// POSITIONS
// ============================================================================

model Position {
  id                String          @id @default(cuid())
  marketId          String
  originalOwnerId   String
  currentOwnerId    String
  side              Side
  amount            Decimal         @db.Decimal(10, 2)
  status            PositionStatus  @default(PENDING)
  payout            Decimal?        @db.Decimal(10, 2)
  isForSale         Boolean         @default(false)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  lastTransferredAt DateTime?

  // Relations
  market            Market                   @relation(fields: [marketId], references: [id], onDelete: Cascade)
  originalOwner     User                     @relation(fields: [originalOwnerId], references: [id])
  currentOwner      User                     @relation(fields: [currentOwnerId], references: [id])
  listing           MarketplaceListing?
  transfers         PositionTransfer[]

  @@index([marketId])
  @@index([currentOwnerId])
  @@index([status])
  @@index([isForSale])
}

enum Side {
  YES
  NO
}

enum PositionStatus {
  PENDING
  ACTIVE
  WON
  LOST
  REFUNDED
}

// ============================================================================
// MARKETPLACE (SECONDARY MARKET)
// ============================================================================

model MarketplaceListing {
  id             String         @id @default(cuid())
  positionId     String         @unique
  marketId       String
  sellerId       String
  buyerId        String?
  askPrice       Decimal        @db.Decimal(10, 2)
  suggestedPrice Decimal        @db.Decimal(10, 2)
  platformFee    Decimal        @default(0.025) @db.Decimal(4, 3)  // 2.5%
  status         ListingStatus  @default(ACTIVE)
  listedAt       DateTime       @default(now())
  soldAt         DateTime?
  cancelledAt    DateTime?

  // Relations
  position       Position       @relation(fields: [positionId], references: [id], onDelete: Cascade)
  market         Market         @relation(fields: [marketId], references: [id], onDelete: Cascade)
  seller         User           @relation("SellerListings", fields: [sellerId], references: [id])
  buyer          User?          @relation("BuyerListings", fields: [buyerId], references: [id])

  @@index([marketId])
  @@index([status])
  @@index([sellerId])
}

enum ListingStatus {
  ACTIVE
  SOLD
  CANCELLED
}

// ============================================================================
// POSITION TRANSFERS (AUDIT TRAIL)
// ============================================================================

model PositionTransfer {
  id             String   @id @default(cuid())
  positionId     String
  fromUserId     String
  toUserId       String
  price          Decimal  @db.Decimal(10, 2)
  listingId      String?
  transferredAt  DateTime @default(now())

  // Relations
  position       Position @relation(fields: [positionId], references: [id], onDelete: Cascade)
  fromUser       User     @relation("TransfersFrom", fields: [fromUserId], references: [id])
  toUser         User     @relation("TransfersTo", fields: [toUserId], references: [id])

  @@index([positionId])
  @@index([fromUserId])
  @@index([toUserId])
}

// ============================================================================
// TRANSACTIONS (BALANCE HISTORY)
// ============================================================================

model Transaction {
  id          String            @id @default(cuid())
  userId      String
  type        TransactionType
  amount      Decimal           @db.Decimal(10, 2)
  balanceBefore Decimal         @db.Decimal(10, 2)
  balanceAfter  Decimal         @db.Decimal(10, 2)
  reference   String?           // positionId, listingId, etc.
  description String
  createdAt   DateTime          @default(now())

  // Relations
  user        User              @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([type])
  @@index([createdAt])
}

enum TransactionType {
  INITIAL_BALANCE
  BET_PLACED
  BET_REFUNDED
  POSITION_SOLD
  POSITION_PURCHASED
  PAYOUT_RECEIVED
  ADMIN_ADJUSTMENT
}
```

---

## ⚙️ Core Services Implementation

### 1. OddsCalculator Service

```typescript
// src/services/odds-calculator.service.ts

import { Decimal } from '@prisma/client/runtime/library';

export class OddsCalculator {
  /**
   * Calculate current odds for a market
   */
  static calculateOdds(yesPool: Decimal, noPool: Decimal) {
    const total = new Decimal(yesPool).plus(noPool);
    
    if (total.isZero()) {
      return {
        yesOdds: 50,
        noOdds: 50,
        yesPayout: new Decimal(2),
        noPayout: new Decimal(2),
      };
    }

    const yesOdds = new Decimal(yesPool).dividedBy(total).times(100);
    const noOdds = new Decimal(noPool).dividedBy(total).times(100);

    return {
      yesOdds: yesOdds.toNumber(),
      noOdds: noOdds.toNumber(),
      yesPayout: this.calculatePayout(yesPool, total, 0.10),
      noPayout: this.calculatePayout(noPool, total, 0.10),
    };
  }

  /**
   * Calculate payout multiplier for a side
   */
  private static calculatePayout(
    sidePool: Decimal,
    totalPool: Decimal,
    platformFee: number
  ): Decimal {
    if (new Decimal(sidePool).isZero()) {
      return new Decimal(0);
    }

    const netPool = totalPool.times(1 - platformFee);
    return netPool.dividedBy(sidePool);
  }

  /**
   * Calculate fair value of a position
   */
  static calculateFairValue(
    position: { amount: Decimal; side: 'YES' | 'NO' },
    market: { yesPool: Decimal; noPool: Decimal }
  ): Decimal {
    const odds = this.calculateOdds(market.yesPool, market.noPool);
    const payout = position.side === 'YES' ? odds.yesPayout : odds.noPayout;
    
    // Fair value = potential return × 95% (5% liquidity discount)
    const potentialReturn = new Decimal(position.amount).times(payout);
    return potentialReturn.times(0.95);
  }

  /**
   * Recalculate odds after a new position is added
   */
  static recalculateAfterBet(
    currentYesPool: Decimal,
    currentNoPool: Decimal,
    betAmount: Decimal,
    betSide: 'YES' | 'NO'
  ) {
    const newYesPool = betSide === 'YES' 
      ? new Decimal(currentYesPool).plus(betAmount)
      : currentYesPool;
    
    const newNoPool = betSide === 'NO'
      ? new Decimal(currentNoPool).plus(betAmount)
      : currentNoPool;

    return this.calculateOdds(newYesPool, newNoPool);
  }
}
```

### 2. Position Service

```typescript
// src/services/position.service.ts

import { prisma } from '@/lib/prisma';
import { OddsCalculator } from './odds-calculator.service';
import { BalanceService } from './balance.service';
import { Decimal } from '@prisma/client/runtime/library';

export class PositionService {
  /**
   * Create a new position (place a bet)
   */
  static async createPosition(data: {
    marketId: string;
    userId: string;
    side: 'YES' | 'NO';
    amount: number;
  }) {
    return await prisma.$transaction(async (tx) => {
      // 1. Verify market is active
      const market = await tx.market.findUnique({
        where: { id: data.marketId },
      });

      if (!market || market.status !== 'ACTIVE') {
        throw new Error('Market is not active');
      }

      // 2. Verify user has sufficient balance
      const user = await tx.user.findUnique({
        where: { id: data.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const amount = new Decimal(data.amount);
      if (new Decimal(user.balance).lessThan(amount)) {
        throw new Error('Insufficient balance');
      }

      // 3. Deduct balance
      await BalanceService.deduct(
        tx,
        user.id,
        amount,
        'BET_PLACED',
        `Bet ${data.amount} on ${data.side}`
      );

      // 4. Create position
      const position = await tx.position.create({
        data: {
          marketId: data.marketId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: data.side,
          amount: amount,
          status: 'ACTIVE',
        },
        include: {
          market: true,
          currentOwner: true,
        },
      });

      // 5. Update market pools
      const updateData = data.side === 'YES'
        ? { yesPool: { increment: amount } }
        : { noPool: { increment: amount } };

      await tx.market.update({
        where: { id: data.marketId },
        data: updateData,
      });

      return position;
    });
  }

  /**
   * Get user's positions
   */
  static async getUserPositions(userId: string, filters?: {
    marketId?: string;
    status?: string;
  }) {
    return await prisma.position.findMany({
      where: {
        currentOwnerId: userId,
        ...(filters?.marketId && { marketId: filters.marketId }),
        ...(filters?.status && { status: filters.status as any }),
      },
      include: {
        market: true,
        listing: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get position with calculated fair value
   */
  static async getPositionWithValue(positionId: string) {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: {
        market: true,
        currentOwner: true,
        listing: true,
      },
    });

    if (!position) {
      throw new Error('Position not found');
    }

    const fairValue = OddsCalculator.calculateFairValue(
      { amount: position.amount, side: position.side },
      { yesPool: position.market.yesPool, noPool: position.market.noPool }
    );

    const odds = OddsCalculator.calculateOdds(
      position.market.yesPool,
      position.market.noPool
    );

    const currentPayout = position.side === 'YES' 
      ? odds.yesPayout 
      : odds.noPayout;

    const potentialReturn = new Decimal(position.amount).times(currentPayout);

    return {
      ...position,
      fairValue: fairValue.toNumber(),
      currentPayout: currentPayout.toNumber(),
      potentialReturn: potentialReturn.toNumber(),
    };
  }
}
```

### 3. Listing Service (Secondary Market)

```typescript
// src/services/listing.service.ts

import { prisma } from '@/lib/prisma';
import { OddsCalculator } from './odds-calculator.service';
import { BalanceService } from './balance.service';
import { Decimal } from '@prisma/client/runtime/library';

export class ListingService {
  /**
   * Create a marketplace listing (sell position)
   */
  static async createListing(data: {
    positionId: string;
    userId: string;
    askPrice: number;
  }) {
    return await prisma.$transaction(async (tx) => {
      // 1. Verify position ownership
      const position = await tx.position.findUnique({
        where: { id: data.positionId },
        include: { market: true },
      });

      if (!position) {
        throw new Error('Position not found');
      }

      if (position.currentOwnerId !== data.userId) {
        throw new Error('Not position owner');
      }

      if (position.isForSale) {
        throw new Error('Position already listed');
      }

      if (position.market.status !== 'ACTIVE') {
        throw new Error('Market not active');
      }

      // 2. Calculate suggested price
      const fairValue = OddsCalculator.calculateFairValue(
        { amount: position.amount, side: position.side },
        { yesPool: position.market.yesPool, noPool: position.market.noPool }
      );

      // 3. Validate ask price (not more than 120% of fair value)
      const askPrice = new Decimal(data.askPrice);
      if (askPrice.greaterThan(fairValue.times(1.2))) {
        throw new Error('Ask price too high');
      }

      // 4. Create listing
      const listing = await tx.marketplaceListing.create({
        data: {
          positionId: data.positionId,
          marketId: position.marketId,
          sellerId: data.userId,
          askPrice: askPrice,
          suggestedPrice: fairValue,
          status: 'ACTIVE',
        },
        include: {
          position: {
            include: {
              market: true,
            },
          },
          seller: true,
        },
      });

      // 5. Mark position as for sale
      await tx.position.update({
        where: { id: data.positionId },
        data: { isForSale: true },
      });

      return listing;
    });
  }

  /**
   * Buy a position from marketplace
   */
  static async buyListing(data: {
    listingId: string;
    buyerId: string;
  }) {
    return await prisma.$transaction(async (tx) => {
      // 1. Get and lock listing
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: data.listingId },
        include: {
          position: true,
          seller: true,
        },
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      if (listing.status !== 'ACTIVE') {
        throw new Error('Listing not available');
      }

      if (listing.sellerId === data.buyerId) {
        throw new Error('Cannot buy own listing');
      }

      // 2. Verify buyer balance
      const buyer = await tx.user.findUnique({
        where: { id: data.buyerId },
      });

      if (!buyer) {
        throw new Error('Buyer not found');
      }

      if (new Decimal(buyer.balance).lessThan(listing.askPrice)) {
        throw new Error('Insufficient balance');
      }

      // 3. Calculate platform fee
      const platformFee = new Decimal(listing.askPrice).times(listing.platformFee);
      const sellerReceives = new Decimal(listing.askPrice).minus(platformFee);

      // 4. Transfer money
      // Deduct from buyer
      await BalanceService.deduct(
        tx,
        buyer.id,
        listing.askPrice,
        'POSITION_PURCHASED',
        `Bought position #${listing.positionId}`
      );

      // Credit to seller
      await BalanceService.credit(
        tx,
        listing.sellerId,
        sellerReceives,
        'POSITION_SOLD',
        `Sold position #${listing.positionId}`
      );

      // 5. Transfer position ownership
      await tx.position.update({
        where: { id: listing.positionId },
        data: {
          currentOwnerId: data.buyerId,
          isForSale: false,
          lastTransferredAt: new Date(),
        },
      });

      // 6. Record transfer
      await tx.positionTransfer.create({
        data: {
          positionId: listing.positionId,
          fromUserId: listing.sellerId,
          toUserId: data.buyerId,
          price: listing.askPrice,
          listingId: listing.id,
        },
      });

      // 7. Mark listing as sold
      await tx.marketplaceListing.update({
        where: { id: data.listingId },
        data: {
          status: 'SOLD',
          buyerId: data.buyerId,
          soldAt: new Date(),
        },
      });

      return listing;
    });
  }

  /**
   * Get all active listings
   */
  static async getActiveListings(filters?: {
    marketId?: string;
    side?: 'YES' | 'NO';
  }) {
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        status: 'ACTIVE',
        ...(filters?.marketId && { marketId: filters.marketId }),
        ...(filters?.side && {
          position: {
            side: filters.side,
          },
        }),
      },
      include: {
        position: {
          include: {
            market: true,
          },
        },
        seller: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        listedAt: 'desc',
      },
    });

    // Calculate additional info for each listing
    return listings.map(listing => {
      const odds = OddsCalculator.calculateOdds(
        listing.position.market.yesPool,
        listing.position.market.noPool
      );

      const currentPayout = listing.position.side === 'YES'
        ? odds.yesPayout
        : odds.noPayout;

      const potentialReturn = new Decimal(listing.position.amount)
        .times(currentPayout);

      const potentialProfit = potentialReturn.minus(listing.askPrice);
      const roi = new Decimal(listing.askPrice).isZero()
        ? 0
        : potentialProfit.dividedBy(listing.askPrice).times(100).toNumber();

      return {
        ...listing,
        currentPayout: currentPayout.toNumber(),
        potentialReturn: potentialReturn.toNumber(),
        potentialProfit: potentialProfit.toNumber(),
        roi,
      };
    });
  }

  /**
   * Update listing price
   */
  static async updatePrice(
    listingId: string,
    userId: string,
    newPrice: number
  ) {
    return await prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId },
        include: {
          position: {
            include: {
              market: true,
            },
          },
        },
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      if (listing.sellerId !== userId) {
        throw new Error('Not listing owner');
      }

      if (listing.status !== 'ACTIVE') {
        throw new Error('Listing not active');
      }

      // Validate new price
      const fairValue = OddsCalculator.calculateFairValue(
        { amount: listing.position.amount, side: listing.position.side },
        { 
          yesPool: listing.position.market.yesPool, 
          noPool: listing.position.market.noPool 
        }
      );

      const askPrice = new Decimal(newPrice);
      if (askPrice.greaterThan(fairValue.times(1.2))) {
        throw new Error('New price too high');
      }

      return await tx.marketplaceListing.update({
        where: { id: listingId },
        data: {
          askPrice: askPrice,
          suggestedPrice: fairValue,
        },
      });
    });
  }

  /**
   * Cancel listing
   */
  static async cancelListing(listingId: string, userId: string) {
    return await prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId },
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      if (listing.sellerId !== userId) {
        throw new Error('Not listing owner');
      }

      if (listing.status !== 'ACTIVE') {
        throw new Error('Listing not active');
      }

      await tx.marketplaceListing.update({
        where: { id: listingId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      await tx.position.update({
        where: { id: listing.positionId },
        data: {
          isForSale: false,
        },
      });

      return listing;
    });
  }
}
```

### 4. Settlement Service

```typescript
// src/services/settlement.service.ts

import { prisma } from '@/lib/prisma';
import { OddsCalculator } from './odds-calculator.service';
import { BalanceService } from './balance.service';
import { Decimal } from '@prisma/client/runtime/library';

export class SettlementService {
  /**
   * Resolve market and settle all positions
   */
  static async resolveMarket(marketId: string, outcome: 'YES' | 'NO' | 'VOID') {
    return await prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id: marketId },
        include: {
          positions: true,
          listings: {
            where: { status: 'ACTIVE' },
          },
        },
      });

      if (!market) {
        throw new Error('Market not found');
      }

      if (market.status !== 'ACTIVE' && market.status !== 'CLOSED') {
        throw new Error('Market cannot be resolved');
      }

      // 1. Cancel all active listings
      if (market.listings.length > 0) {
        await tx.marketplaceListing.updateMany({
          where: {
            marketId: marketId,
            status: 'ACTIVE',
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
          },
        });

        await tx.position.updateMany({
          where: {
            marketId: marketId,
            isForSale: true,
          },
          data: {
            isForSale: false,
          },
        });
      }

      // 2. Handle VOID (refund everyone)
      if (outcome === 'VOID') {
        for (const position of market.positions) {
          if (position.status === 'ACTIVE') {
            await BalanceService.credit(
              tx,
              position.currentOwnerId,
              position.amount,
              'BET_REFUNDED',
              `Refund for voided market`
            );

            await tx.position.update({
              where: { id: position.id },
              data: {
                status: 'REFUNDED',
                payout: position.amount,
              },
            });
          }
        }

        await tx.market.update({
          where: { id: marketId },
          data: {
            status: 'VOIDED',
            resolvedAt: new Date(),
          },
        });

        return { type: 'VOID', refunded: market.positions.length };
      }

      // 3. Calculate payouts for winners
      const totalPool = new Decimal(market.yesPool).plus(market.noPool);
      const platformFee = totalPool.times(market.platformFee);
      const netPool = totalPool.minus(platformFee);

      const winningPool = outcome === 'YES' ? market.yesPool : market.noPool;
      const payoutMultiplier = new Decimal(winningPool).isZero()
        ? new Decimal(0)
        : netPool.dividedBy(winningPool);

      let winnersCount = 0;
      let losersCount = 0;
      let totalPaidOut = new Decimal(0);

      // 4. Process all positions
      for (const position of market.positions) {
        if (position.status !== 'ACTIVE') {
          continue;
        }

        const isWinner = position.side === outcome;

        if (isWinner) {
          const payout = new Decimal(position.amount).times(payoutMultiplier);
          
          await BalanceService.credit(
            tx,
            position.currentOwnerId,
            payout,
            'PAYOUT_RECEIVED',
            `Winnings from market resolution`
          );

          await tx.position.update({
            where: { id: position.id },
            data: {
              status: 'WON',
              payout: payout,
            },
          });

          totalPaidOut = totalPaidOut.plus(payout);
          winnersCount++;
        } else {
          await tx.position.update({
            where: { id: position.id },
            data: {
              status: 'LOST',
              payout: new Decimal(0),
            },
          });

          losersCount++;
        }
      }

      // 5. Update market
      await tx.market.update({
        where: { id: marketId },
        data: {
          status: 'RESOLVED',
          outcome: outcome,
          resolvedAt: new Date(),
        },
      });

      return {
        type: 'RESOLVED',
        outcome,
        winnersCount,
        losersCount,
        totalPaidOut: totalPaidOut.toNumber(),
        platformFee: platformFee.toNumber(),
        payoutMultiplier: payoutMultiplier.toNumber(),
      };
    });
  }

  /**
   * Generate settlement report
   */
  static async getSettlementReport(marketId: string) {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: {
        positions: {
          include: {
            currentOwner: {
              select: {
                id: true,
                username: true,
              },
            },
            originalOwner: {
              select: {
                id: true,
                username: true,
              },
            },
            transfers: true,
          },
        },
      },
    });

    if (!market) {
      throw new Error('Market not found');
    }

    const winners = market.positions.filter(p => p.status === 'WON');
    const losers = market.positions.filter(p => p.status === 'LOST');
    const refunded = market.positions.filter(p => p.status === 'REFUNDED');

    const totalWinnings = winners.reduce(
      (sum, p) => sum.plus(p.payout || 0),
      new Decimal(0)
    );

    const totalLosses = losers.reduce(
      (sum, p) => sum.plus(p.amount),
      new Decimal(0)
    );

    const totalPool = new Decimal(market.yesPool).plus(market.noPool);
    const platformFee = totalPool.times(market.platformFee);

    // Secondary market stats
    const allTransfers = market.positions.flatMap(p => p.transfers);
    const secondaryVolume = allTransfers.reduce(
      (sum, t) => sum.plus(t.price),
      new Decimal(0)
    );
    const secondaryFees = secondaryVolume.times(0.025); // 2.5%

    return {
      market: {
        id: market.id,
        question: market.question,
        playerName: market.playerName,
        status: market.status,
        outcome: market.outcome,
        resolvedAt: market.resolvedAt,
      },
      pools: {
        yes: market.yesPool.toNumber(),
        no: market.noPool.toNumber(),
        total: totalPool.toNumber(),
      },
      results: {
        winners: winners.length,
        losers: losers.length,
        refunded: refunded.length,
        totalWinnings: totalWinnings.toNumber(),
        totalLosses: totalLosses.toNumber(),
      },
      fees: {
        primaryMarket: platformFee.toNumber(),
        secondaryMarket: secondaryFees.toNumber(),
        total: platformFee.plus(secondaryFees).toNumber(),
      },
      secondaryMarket: {
        transfers: allTransfers.length,
        volume: secondaryVolume.toNumber(),
      },
      positions: market.positions.map(p => ({
        id: p.id,
        originalOwner: p.originalOwner.username,
        currentOwner: p.currentOwner.username,
        side: p.side,
        amount: p.amount.toNumber(),
        status: p.status,
        payout: p.payout?.toNumber() || 0,
        wasTraded: p.transfers.length > 0,
        transferCount: p.transfers.length,
      })),
    };
  }
}
```

---

## 🔌 WebSocket Implementation

```typescript
// src/lib/socket.ts

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiRequest } from 'next';

let io: SocketIOServer | undefined;

export const initSocketServer = (server: HTTPServer) => {
  io = new SocketIOServer(server, {
    path: '/api/socket',
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join:market', (marketId: string) => {
      socket.join(`market:${marketId}`);
      console.log(`Client ${socket.id} joined market ${marketId}`);
    });

    socket.on('leave:market', (marketId: string) => {
      socket.leave(`market:${marketId}`);
    });

    socket.on('join:user', (userId: string) => {
      socket.join(`user:${userId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

export const getSocketServer = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Event emitters
export const emitMarketUpdate = (marketId: string, data: any) => {
  io?.to(`market:${marketId}`).emit('market:updated', data);
};

export const emitListingCreated = (marketId: string, listing: any) => {
  io?.to(`market:${marketId}`).emit('listing:created', listing);
};

export const emitListingSold = (listingId: string, data: any) => {
  io?.emit('listing:sold', data);
};

export const emitBalanceUpdate = (userId: string, balance: number) => {
  io?.to(`user:${userId}`).emit('balance:updated', { balance });
};

export const emitMarketResolved = (marketId: string, data: any) => {
  io?.to(`market:${marketId}`).emit('market:resolved', data);
};
```

```typescript
// src/hooks/useSocket.ts

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket>();

  useEffect(() => {
    const socket = io({
      path: '/api/socket',
    });

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket disconnected');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinMarket = (marketId: string) => {
    socketRef.current?.emit('join:market', marketId);
  };

  const leaveMarket = (marketId: string) => {
    socketRef.current?.emit('leave:market', marketId);
  };

  const joinUser = (userId: string) => {
    socketRef.current?.emit('join:user', userId);
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
  };

  const off = (event: string) => {
    socketRef.current?.off(event);
  };

  return {
    socket: socketRef.current,
    isConnected,
    joinMarket,
    leaveMarket,
    joinUser,
    on,
    off,
  };
};
```

---

## 📝 Seed Data

```typescript
// prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@wsm.com',
        role: 'ADMIN',
        balance: new Decimal(10000),
      },
    }),
    prisma.user.create({
      data: {
        username: 'juan_futbol',
        email: 'juan@example.com',
        balance: new Decimal(1000),
      },
    }),
    prisma.user.create({
      data: {
        username: 'maria_sports',
        email: 'maria@example.com',
        balance: new Decimal(1000),
      },
    }),
    prisma.user.create({
      data: {
        username: 'pedro_trader',
        email: 'pedro@example.com',
        balance: new Decimal(1000),
      },
    }),
    prisma.user.create({
      data: {
        username: 'carlos_bet',
        email: 'carlos@example.com',
        balance: new Decimal(1000),
      },
    }),
  ]);

  console.log('✅ Created users:', users.map(u => u.username));

  // Create markets
  const markets = await Promise.all([
    prisma.market.create({
      data: {
        playerName: 'Alexis Mac Allister',
        question: 'Will Alexis Mac Allister be transferred before the window closes?',
        description: 'Liverpool midfielder linked with Barcelona and Real Madrid',
        status: 'ACTIVE',
        resolutionDate: new Date('2026-08-31'),
      },
    }),
    prisma.market.create({
      data: {
        playerName: 'Emiliano Martínez',
        question: 'Will Emiliano Martínez move to a new club this season?',
        description: 'Aston Villa goalkeeper receiving interest from Bayern Munich',
        status: 'ACTIVE',
        resolutionDate: new Date('2026-08-31'),
      },
    }),
    prisma.market.create({
      data: {
        playerName: 'Enzo Fernández',
        question: 'Will Enzo Fernández leave Chelsea in the summer?',
        description: 'Chelsea midfielder could return to Argentina',
        status: 'DRAFT',
        resolutionDate: new Date('2026-08-31'),
      },
    }),
  ]);

  console.log('✅ Created markets:', markets.map(m => m.playerName));

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## 🚀 Implementation Steps

### Phase 1: Foundation (Days 1-2)
1. **Setup project**
   ```bash
   npx create-next-app@latest wsm-predictions --typescript --tailwind --app
   cd wsm-predictions
   npm install prisma @prisma/client socket.io socket.io-client
   npm install -D @types/socket.io
   ```

2. **Configure Prisma**
   - Copy schema to `prisma/schema.prisma`
   - Setup PostgreSQL database
   - Run migrations: `npx prisma migrate dev --name init`
   - Run seed: `npx prisma db seed`

3. **Basic structure**
   - Create folder structure as outlined
   - Setup Prisma client singleton
   - Configure TypeScript paths

### Phase 2: Core Services (Days 3-4)
1. Implement all services in `src/services/`
2. Create API routes for:
   - Markets (GET, POST, resolve)
   - Positions (GET, POST)
   - Marketplace (GET listings, POST buy/sell)
3. Add validation with Zod
4. Test all services with Postman/Insomnia

### Phase 3: WebSocket (Day 5)
1. Setup Socket.io server
2. Implement event emitters
3. Create React hook for socket connection
4. Test real-time updates

### Phase 4: UI Components (Days 6-8)
1. **Install shadcn/ui**
   ```bash
   npx shadcn-ui@latest init
   npx shadcn-ui@latest add button card input dialog
   ```

2. **Build components**
   - MarketCard, MarketDetail
   - PlaceBetModal
   - PositionCard, SellPositionModal
   - ListingCard, BuyModal
   - Admin forms

3. **Create pages**
   - Market list
   - Market detail
   - Marketplace
   - My Positions
   - Admin panel

### Phase 5: Integration (Days 9-10)
1. Connect UI to API
2. Implement real-time updates
3. Add optimistic UI updates
4. Handle loading/error states

### Phase 6: Testing & Polish (Days 11-12)
1. Multi-user testing
2. Edge case handling
3. UI/UX improvements
4. Performance optimization

---

## 🧪 Testing Scenarios

### Test Case 1: Basic Bet Flow
```
1. User juan_futbol logs in (balance: $1000)
2. Views Mac Allister market (50/50 odds)
3. Places $100 bet on YES
4. Balance updates to $900
5. Market odds update to ~62.5% YES / 37.5% NO
6. All users see new odds in real-time
```

### Test Case 2: Secondary Market Trade
```
1. juan_futbol has YES position ($100)
2. Odds improve, potential payout $144
3. Lists position for $135
4. pedro_trader sees listing
5. Buys for $135
6. juan receives $131.62 (after 2.5% fee)
7. pedro now owns position
8. Position removed from marketplace
```

### Test Case 3: Market Resolution
```
1. Admin resolves market: YES wins
2. All active listings cancelled
3. Calculate payouts for all winners
4. pedro_trader receives $144 (owns juan's position)
5. All losers receive $0
6. Balances update
7. Settlement report generated
```

### Test Case 4: Concurrent Purchase
```
1. Position listed for $100
2. Two users click buy simultaneously
3. First transaction locks listing
4. Second transaction fails gracefully
5. Only one user gets position
```

---

## 🔐 Security Considerations

1. **Input Validation**
   - Use Zod for all API inputs
   - Validate amounts (positive, within limits)
   - Sanitize user inputs

2. **Authorization**
   - Verify ownership before allowing sells/cancels
   - Admin-only routes protected
   - User-specific data filtered

3. **Transaction Safety**
   - Use Prisma transactions for all money operations
   - Implement optimistic locking for listings
   - Prevent double-spending

4. **Rate Limiting**
   - Add rate limits to API routes
   - Prevent spam betting
   - Throttle WebSocket events

---

## 📊 Performance Optimizations

1. **Database Indexes**
   - Already defined in schema
   - Monitor query performance
   - Add composite indexes if needed

2. **Caching**
   - Cache market odds calculations
   - Use React Query for client-side caching
   - Invalidate on updates

3. **Real-time**
   - Debounce frequent updates
   - Batch socket emissions
   - Use rooms for targeted broadcasts

4. **Bundle Size**
   - Code splitting for admin routes
   - Lazy load heavy components
   - Optimize images

---

## 🎨 UI/UX Guidelines

### Design Principles
1. **Clear hierarchy** - Important info prominent
2. **Real-time feedback** - Show updates immediately
3. **Loading states** - Always show progress
4. **Error handling** - Helpful error messages
5. **Mobile-first** - Responsive design

### Color Coding
- **YES** - Green (`#4ade80`)
- **NO** - Red (`#f87171`)
- **Pending** - Yellow (`#fbbf24`)
- **Won** - Dark Green (`#22c55e`)
- **Lost** - Dark Red (`#ef4444`)

### Key Metrics Display
- Current odds (large, prominent)
- Pool sizes
- User balance (always visible)
- Potential payout
- ROI percentage

---

## 📦 Environment Variables

```bash
# .env.example

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/wsm_predictions"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# Socket.io (auto-configured)

# Admin
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-this-in-production"
```

---

## 🐛 Common Issues & Solutions

### Issue 1: Socket.io not connecting
**Solution:** Ensure Socket.io server is initialized in custom server or API route

### Issue 2: Prisma transaction timeouts
**Solution:** Increase timeout in prisma client config, optimize queries

### Issue 3: Stale odds display
**Solution:** Implement proper cache invalidation, use React Query

### Issue 4: Race condition on buy
**Solution:** Use database transactions with row-level locking

---

## 📚 Additional Resources

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Prisma Docs](https://www.prisma.io/docs)
- [Socket.io Docs](https://socket.io/docs/v4/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [React Query](https://tanstack.com/query/latest)

---

## 🎯 Success Criteria

The MVP is complete when:

- ✅ Multiple users can register and login
- ✅ Users can view active markets with real-time odds
- ✅ Users can place bets (create positions)
- ✅ Odds update automatically after each bet
- ✅ Users can list positions for sale
- ✅ Users can browse and buy listed positions
- ✅ All balance changes are tracked
- ✅ Admin can resolve markets
- ✅ Settlement distributes payouts correctly
- ✅ Reports show complete market history
- ✅ Everything updates in real-time for all users

---

## 🚦 Next Steps After MVP

1. **Authentication** - Add proper auth (Clerk, Auth.js)
2. **Real Money** - Payment gateway integration
3. **Mobile App** - React Native version
4. **Advanced Trading** - Limit orders, stop losses
5. **Analytics** - User performance tracking
6. **Notifications** - Email/push for market events
7. **Social Features** - Leaderboards, following traders

---

**Good luck building! 🚀**

This document contains everything needed to implement the WSM Predictions MVP. Use it as your guide with Claude Code for autonomous development.
