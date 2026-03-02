
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testApi() {
  console.log('--- Testing API Logic with Prisma ---');
  try {
    const id = 'cmlsj49eh00032dma9onqcf82'; // from previous debug
    const side = 'YES';
    const amountStr = '100';

    const market = await prisma.market.findUnique({
      where: { id },
      select: {
          id: true,
          qYes: true,
          qNo: true,
          b: true,
          maxBetAmount: true,
          maxPriceImpact: true,
      }
    });

    console.log('Market:', market);

    const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
    console.log('Config:', config);

    // If we reach here, prisma properties exist.
    console.log('SUCCESS: Prisma access for new fields works.');

  } catch (error) {
    console.error('SERVER-SIDE ERROR SIMULATION:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testApi();
