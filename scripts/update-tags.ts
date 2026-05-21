import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// sport must match SportFilter in src/app/markets/page.tsx:
// 'futbol' | 'copa_mundial' | 'tenis' | 'f1' | 'nba' | 'nfl'

interface Update {
  id: string;
  sport: string;
  tags: string[];
  isFeatured?: boolean;
}

const UPDATES: Update[] = [
  // ── F1 ───────────────────────────────────────────────────────────────────
  {
    id: "cmpefldep000h707tel0oopkz", // Hamilton Ferrari
    sport: "f1",
    tags: ["F1", "Ferrari", "Hamilton", "2026"],
  },
  {
    id: "cmpekoxsk0008vh6fg8z3h5ex", // Colapinto GP Canadá
    sport: "f1",
    tags: ["F1", "Colapinto", "GP Canadá", "Argentina"],
    isFeatured: true,
  },

  // ── Copa del Mundo 2026 ─────────────────────────────────────────────────
  {
    id: "cmpfilaym003kvh6f32y5drth", // Argentina Campeón Mundo
    sport: "copa_mundial",
    tags: ["Copa del Mundo", "Argentina", "Selección", "2026"],
    isFeatured: true,
  },
  {
    id: "cmpfmnvtb001jy3c4o8w32oc9", // Argentina o Brasil Campeón
    sport: "copa_mundial",
    tags: ["Copa del Mundo", "Argentina", "Brasil", "Sudamérica"],
  },
  {
    id: "cmpfmtitp001ny3c46zu7lkp5", // Lamine Yamal MVP
    sport: "copa_mundial",
    tags: ["Copa del Mundo", "Lamine Yamal", "España", "MVP"],
  },
  {
    id: "cmpfmv89a001ry3c45y4m42k2", // Mbappé Campeón
    sport: "copa_mundial",
    tags: ["Copa del Mundo", "Mbappé", "Francia"],
  },
  {
    id: "cmpfn85ab0020y3c4a0gc4hw1", // Messi gol debut
    sport: "copa_mundial",
    tags: ["Copa del Mundo", "Messi", "Argentina", "Gol"],
    isFeatured: true,
  },

  // ── Fútbol — Copa Libertadores / Sudamericana / Liga Argentina ──────────
  {
    id: "cmpfm7uy60013y3c40ucq0w1n", // Boca octavos Libertadores
    sport: "futbol",
    tags: ["Libertadores", "Boca Juniors", "Argentina", "Conmebol"],
  },
  {
    id: "cmpfmgzim0017y3c4zvcphhp8", // Equipo Argentino Libertadores
    sport: "futbol",
    tags: ["Libertadores", "Argentina", "Conmebol"],
  },
  {
    id: "cmpfmklfv001by3c4jd1hnu1o", // Equipo Argentino Sudamericana
    sport: "futbol",
    tags: ["Sudamericana", "Argentina", "Conmebol"],
  },
  {
    id: "cmpfmlov7001fy3c4udy8nyge", // River Sudamericana
    sport: "futbol",
    tags: ["Sudamericana", "River Plate", "Argentina"],
  },
  {
    id: "cmpfifcpw0039vh6facnua07x", // River vs Belgrano Liga
    sport: "futbol",
    tags: ["Liga Argentina", "River Plate", "Belgrano", "Apertura"],
    isFeatured: true,
  },

  // ── NBA ─────────────────────────────────────────────────────────────────
  {
    id: "cmpfj1c3b0054vh6fy2ecf63b", // Game 2 NY vs Cleveland
    sport: "nba",
    tags: ["NBA", "Playoffs", "Knicks", "Cavaliers"],
  },
  {
    id: "cmpfivm0m004xvh6fzi4t4vdl", // Game 3 SA vs OKC
    sport: "nba",
    tags: ["NBA", "Playoffs", "Spurs", "Thunder"],
    isFeatured: true,
  },

  // ── Tenis ───────────────────────────────────────────────────────────────
  {
    id: "cmpfl8nh7000ny3c4r1jp4vgk", // Etcheverry vs Borges
    sport: "tenis",
    tags: ["Tenis", "ATP", "Etcheverry", "Argentina"],
  },
  {
    id: "cmpfluoji000ry3c4sgcp9jn8", // Davidovich vs Džumhur
    sport: "tenis",
    tags: ["Tenis", "ATP", "Davidovich", "Džumhur"],
  },
  {
    id: "cmpfm1lov000vy3c47nnts9kl", // Fritz vs Basavareddy
    sport: "tenis",
    tags: ["Tenis", "ATP", "Fritz", "Basavareddy"],
  },
  {
    id: "cmpfm3pk9000zy3c48epd86y6", // Wawrinka vs Fils
    sport: "tenis",
    tags: ["Tenis", "ATP", "Wawrinka", "Fils"],
  },
];

async function main() {
  console.log(`Actualizando sport + tags en ${UPDATES.length} mercados...\n`);

  for (const u of UPDATES) {
    const before = await prisma.market.findUnique({
      where: { id: u.id },
      select: { question: true, sport: true, tags: true, isFeatured: true },
    });
    if (!before) {
      console.log(`  ✗ NO ENCONTRADO: ${u.id}`);
      continue;
    }

    await prisma.market.update({
      where: { id: u.id },
      data: {
        sport: u.sport,
        tags: u.tags,
        ...(u.isFeatured !== undefined && { isFeatured: u.isFeatured }),
      },
    });

    const feat = u.isFeatured ? " ⭐" : "";
    console.log(`  ✓ [${u.sport.padEnd(13)}] ${u.tags.join(", ")}${feat}`);
    console.log(`     ${before.question}`);
  }

  console.log("\n✅ Etiquetas actualizadas.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
