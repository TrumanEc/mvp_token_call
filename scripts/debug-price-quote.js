
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  console.log('--- Debugging Price Quote Logic ---');
  
  try {
    // 1. Try to find a market
    const market = await prisma.market.findFirst({
      select: {
          id: true,
          qYes: true,
          qNo: true,
          b: true,
          maxBetAmount: true,
          maxPriceImpact: true,
      }
    });
    
    if (!market) {
      console.log('No market found to test.');
      return;
    }
    
    console.log('Market found:', market);

    // 2. Try to find PlatformConfig
    console.log('Testing PlatformConfig access...');
    try {
        const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
        console.log('Config record:', config);
    } catch (e) {
        console.error('Error accessing PlatformConfig:', e.message);
    }

    // 3. Test LMSR Service logic in isolation
    const { LmsrService } = require('../src/services/lmsr.service');
    const lmsr = new LmsrService();
    
    const side = 'YES';
    const amount = 100;
    
    console.log('Calculating shares for amount:', amount);
    const shares = lmsr.getSharesToBuy(market.qYes, market.qNo, market.b, side, amount);
    console.log('Shares:', shares);
    
    const cost = lmsr.getCostToBuy(market.qYes, market.qNo, market.b, side, shares);
    console.log('Recalculated cost:', cost);
    
    const defaultMaxBet = 500;
    const defaultMaxImpact = 5.0;
    const maxBetAmount = market.maxBetAmount ?? defaultMaxBet;
    const maxPriceImpact = market.maxPriceImpact ?? defaultMaxImpact;

    console.log('Validating bet amount...');
    const validation = lmsr.validateBetAmount(
      cost,
      market.qYes,
      market.qNo,
      market.b,
      side,
      maxBetAmount,
      maxPriceImpact
    );
    console.log('Validation result:', validation);

  } catch (error) {
    console.error('CRITICAL ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debug();
