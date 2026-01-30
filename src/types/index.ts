import { Decimal } from '@prisma/client/runtime/library'

export interface MarketOdds {
  yesOdds: number
  noOdds: number
  yesPayout: Decimal
  noPayout: Decimal
}

export interface PositionWithValue {
  id: string
  marketId: string
  side: 'YES' | 'NO'
  amount: number
  status: string
  fairValue: number
  currentPayout: number
  potentialReturn: number
  isForSale: boolean
  market: {
    id: string
    playerName: string
    question: string
    status: string
  }
}

export interface ListingWithMetrics {
  id: string
  positionId: string
  askPrice: number
  suggestedPrice: number
  status: string
  currentPayout: number
  potentialReturn: number
  potentialProfit: number
  roi: number
  position: {
    id: string
    side: 'YES' | 'NO'
    amount: number
    market: {
      id: string
      playerName: string
      question: string
    }
  }
  seller: {
    id: string
    username: string
  }
}

export interface SettlementResult {
  type: 'RESOLVED' | 'VOID'
  outcome?: 'YES' | 'NO'
  winnersCount?: number
  losersCount?: number
  totalPaidOut?: number
  platformFee?: number
  payoutMultiplier?: number
  refunded?: number
}

export interface SocketEvents {
  'market:updated': { marketId: string; yesPool: number; noPool: number; odds: MarketOdds }
  'listing:created': { listing: ListingWithMetrics }
  'listing:sold': { listingId: string; buyerId: string }
  'market:resolved': { marketId: string; outcome: string; result: SettlementResult }
  'balance:updated': { balance: number }
}
