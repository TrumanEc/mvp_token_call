import { prisma } from "../../src/lib/prisma";
import { MarketService } from "../../src/services/market";
import { OrderBookService } from "../../src/services/orderbook.service";
import { RouterService } from "../../src/services/router.service";
import { LmsrService } from "../../src/services/lmsr.service";
import { Decimal } from "@prisma/client/runtime/library";

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

    // 3. Crear el mercado LMSR
    console.log("[3] Creando y activando mercado LMSR (b=100)...");
    let market = await MarketService.create({
      question: "[TEST] Hybrid Router Simulation",
      resolutionDate: new Date(),
      b: 100
    });
    market = await MarketService.activate(market.id);
    
    // 4. Inyectar posiciones iniciales (Los sellers compran del LMSR a precio inicial 0.50 aprox)
    console.log("[4] Entregando shares Iniciales a los Vendedores...");
    
    // User A compra YES
    const posA = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: userA.id,
      side: "YES",
      budget: 100 // Gasta $100
    });
    console.log(`    -> User A compró ${posA.executionSummary.sharesCollected.toFixed(2)} YES shares a $${posA.executionSummary.averagePrice.toFixed(3)}`);

    // User A y B (para variar precios de YES)
    const posB = await RouterService.executeMarketBuy({
      marketId: market.id,
      userId: userB.id,
      side: "YES",
      budget: 150 // Gasta $150
    });
    console.log(`    -> User B compró ${posB.executionSummary.sharesCollected.toFixed(2)} YES shares a $${posB.executionSummary.averagePrice.toFixed(3)}`);

    // 5. Los usuarios ponen Limit Sells
    console.log("\n[5] Creando Muro de Liquidez P2P (Limit Sells)...");
    // El precio actual del LMSR para YES habrá subido, veamos cuánto es:
    const lmsr = new LmsrService();
    const updatedMarket = await prisma.market.findUnique({ where: { id: market.id } });
    const { pYes } = lmsr.getPrice(updatedMarket!.qYes, updatedMarket!.qNo, updatedMarket!.b);
    console.log(`    -> Precio marginal de YES en el LMSR en este instante: $${pYes.toFixed(4)}`);

    // Ponemos órdenes MÁS BARATAS que el LMSR para forzar al Router a consumirlas
    // Y otras más caras.
    
    // User A oferta barato (ej: $0.40) -> El LMSR está en approx 0.60+ 
    // pero los Limit Prices deben ser validos. Si lo pone muy barato pierde $
    const offerPrice1 = Math.max(0.10, pYes - 0.10); // Más barato que el LMSR
    const offerPrice2 = Math.min(0.99, pYes + 0.10); // Más caro que el LMSR

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
      side: "YES",
      budget: 500
    });

    console.log("\n================ REPORT ======================");
    console.log(`💰 Dinero Gastado: $${result.executionSummary.spent.toFixed(2)}`);
    console.log(`📊 Total Shares Comprados: ${result.executionSummary.sharesCollected.toFixed(2)} shares`);
    console.log(`🎯 Precio Promedio Final: $${result.executionSummary.averagePrice.toFixed(4)}\n`);
    
    console.log("🛠️  DESGLOSE EXCECUTADO POR EL ROUTER:");
    console.log(`  - 📗 Shares P2P (OrderBook): ${result.executionSummary.obShares.toFixed(2)} shares`);
    console.log(`  - 🏦 Shares AMM (Mint LMSR): ${result.executionSummary.lmsrShares.toFixed(2)} shares\n`);

    console.log("📝  Rastro Poso a Paso (Order Path):");
    result.executionSummary.path.forEach((step, i) => {
      console.log(`    [Paso ${i+1}] Vía: ${step.fuente.padEnd(10)} | Gastó: $${step.invertido.toFixed(2).padStart(6)} | Adquirió: ${step.shares.toFixed(2).padStart(7)} shares | Precio Prom: $${step.precioPromedio.toFixed(4)}`);
    });

    // Validar base de datos Admin Logs
    const auditLog = await prisma.marketRouterAuditLog.findFirst({
       orderBy: { timestamp: "desc" }
    });
    console.log(`\n✅ Registro en MarketRouterAuditLog guardado exitosamente (id: ${auditLog?.id})`);

  } catch (error) {
    console.error("❌ Error en Simulación:", error);
  } finally {
    console.log("\nFin de la simulación.");
  }
}

main();
