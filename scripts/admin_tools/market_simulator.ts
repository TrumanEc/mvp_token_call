import { prisma } from "../../src/lib/prisma";
import { MarketService } from "../../src/services/market";
import { OrderBookService } from "../../src/services/orderbook.service";
import { RouterService } from "../../src/services/router.service";
import { LmsrService } from "../../src/services/lmsr.service";

async function main() {
  console.log("=========================================");
  console.log("   SIMULADOR DE MERCADO SECUNDARIO WIN   ");
  console.log("=========================================\n");

  try {
    // 1. Limpiar datos de prueba anteriores
    console.log("[1] Limpiando datos de prueba...");
    const dummyUsers = await prisma.user.findMany({
      where: { email: { contains: "sigma_" } }
    });
    const dummyUserIds = dummyUsers.map(u => u.id);
    const testMarkets = await prisma.market.findMany({ where: { question: "[TEST] Hybrid Router Simulation" } });
    const testMarketIds = testMarkets.map(m => m.id);
    await prisma.order.deleteMany({ where: { marketId: { in: testMarketIds } } });
    await prisma.marketRouterAuditLog.deleteMany({ where: { marketId: { in: testMarketIds } } });
    await prisma.marketOutcome.deleteMany({ where: { marketId: { in: testMarketIds } } });
    await prisma.market.deleteMany({ where: { id: { in: testMarketIds } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: dummyUserIds } } });
    await prisma.positionTransfer.deleteMany({ where: { OR: [{ fromUserId: { in: dummyUserIds } }, { toUserId: { in: dummyUserIds } }] } });
    await prisma.position.deleteMany({ where: { OR: [{ currentOwnerId: { in: dummyUserIds } }, { originalOwnerId: { in: dummyUserIds } }] } });
    await prisma.user.deleteMany({ where: { id: { in: dummyUserIds } } });

    // 2. Crear usuarios dummy
    console.log("[2] Creando usuarios dummy...");
    const userA = await prisma.user.create({ data: { email: "sigma_seller1@test.com", username: "sigma_A", balance: 5000 }});
    const userB = await prisma.user.create({ data: { email: "sigma_seller2@test.com", username: "sigma_B", balance: 5000 }});
    const trader = await prisma.user.create({ data: { email: "sigma_buyer@test.com", username: "sigma_Trader", balance: 10000 }});

    // 3. Crear el mercado LMSR (multi-outcome)
    console.log("[3] Creando y activando mercado LMSR (b=100)...");
    let market = await MarketService.create({
      question: "[TEST] Hybrid Router Simulation",
      resolutionDate: new Date(),
      b: 100,
      outcomes: [
        { name: "YES", initialProbability: 0.5 },
        { name: "NO", initialProbability: 0.5 },
      ],
    });
    await MarketService.activate(market.id);

    // Reload with outcomes
    const fullMarket = await prisma.market.findUnique({
      where: { id: market.id },
      include: { outcomes: { orderBy: { displayOrder: "asc" } } },
    });
    if (!fullMarket) throw new Error("Market not found after creation");

    const yesOutcome = fullMarket.outcomes.find(o => o.name === "YES")!;
    const noOutcome = fullMarket.outcomes.find(o => o.name === "NO")!;

    // 4. Inyectar posiciones iniciales
    console.log("[4] Entregando shares Iniciales a los Vendedores...");

    const posA = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: userA.id,
      outcomeId: yesOutcome.id,
      budget: 100,
    });
    console.log(`    -> User A compró ${posA.executionSummary.sharesCollected.toFixed(2)} YES shares a $${posA.executionSummary.averagePrice.toFixed(3)}`);

    const posB = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: userB.id,
      outcomeId: yesOutcome.id,
      budget: 150,
    });
    console.log(`    -> User B compró ${posB.executionSummary.sharesCollected.toFixed(2)} YES shares a $${posB.executionSummary.averagePrice.toFixed(3)}`);

    // 5. Los usuarios ponen Limit Sells
    console.log("\n[5] Creando Muro de Liquidez P2P (Limit Sells)...");
    const lmsr = new LmsrService();
    const updatedMarket = await prisma.market.findUnique({
      where: { id: market.id },
      include: { outcomes: { orderBy: { displayOrder: "asc" } } },
    });
    const qVector = LmsrService.buildQVector(updatedMarket!.outcomes);
    const params = { b: updatedMarket!.b, alpha: updatedMarket!.alpha, bMin: updatedMarket!.bMin };
    const prices = lmsr.getPricesLSN(qVector, params);
    const pYes = prices[0];
    console.log(`    -> Precio marginal de YES en el LMSR en este instante: $${pYes.toFixed(4)}`);

    const offerPrice1 = Math.max(0.10, pYes - 0.10);
    const offerPrice2 = Math.min(0.99, pYes + 0.10);

    console.log(`    -> User A listando ${posA.executionSummary.sharesCollected.toFixed(2)} YES a $${offerPrice1.toFixed(3)}`);
    await OrderBookService.createLimitSell({
      marketId: market.id,
      userId: userA.id,
      positionId: posA.position.id,
      sharesToSell: posA.executionSummary.sharesCollected,
      pricePerShare: parseFloat(offerPrice1.toFixed(3))
    });

    console.log(`    -> User B listando ${posB.executionSummary.sharesCollected.toFixed(2)} YES a $${offerPrice2.toFixed(3)}`);
    await OrderBookService.createLimitSell({
      marketId: market.id,
      userId: userB.id,
      positionId: posB.position.id,
      sharesToSell: posB.executionSummary.sharesCollected,
      pricePerShare: parseFloat(offerPrice2.toFixed(3))
    });

    // 6. El Trader entra y hace una compra "Best Buy" masiva
    console.log("\n[6] EJECUTANDO HYBRID ROUTER BEST BUY...");
    console.log(`    -> Trader solicita comprar $500 en acciones YES...`);

    const result = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: trader.id,
      outcomeId: yesOutcome.id,
      budget: 500,
    });

    console.log("\n================ REPORT ======================");
    console.log(`Total Shares Comprados: ${result.executionSummary.sharesCollected.toFixed(2)} shares`);
    console.log(`Precio Promedio Final: $${result.executionSummary.averagePrice.toFixed(4)}\n`);

    console.log("DESGLOSE EJECUTADO POR EL ROUTER:");
    console.log(`  - Shares P2P (OrderBook): ${result.executionSummary.obShares.toFixed(2)} shares`);
    console.log(`  - Shares AMM (Mint LMSR): ${result.executionSummary.lmsrShares.toFixed(2)} shares\n`);

    console.log("Rastro Paso a Paso (Order Path):");
    result.executionSummary.path.forEach((step: any, i: number) => {
      console.log(`    [Paso ${i+1}] Via: ${step.fuente.padEnd(10)} | Gasto: $${step.invertidoBruto.toFixed(2).padStart(6)} | Adquirio: ${step.shares.toFixed(2).padStart(7)} shares | Precio Prom: $${step.precioPromedio.toFixed(4)}`);
    });

    const auditLog = await prisma.marketRouterAuditLog.findFirst({
       orderBy: { timestamp: "desc" }
    });
    console.log(`\nRegistro en MarketRouterAuditLog guardado exitosamente (id: ${auditLog?.id})`);

  } catch (error) {
    console.error("Error en Simulacion:", error);
  } finally {
    console.log("\nFin de la simulacion.");
  }
}

main();
