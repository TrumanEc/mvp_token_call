# Testing Playbook — Validar la migración

> Lista concreta de tests a correr en cada fase del [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).
> Énfasis especial en **paridad LMSR**: cada función matemática del backend
> debe dar los mismos números que el MVP validado, hasta el 6º decimal.

---

## 1. Filosofía

La migración del MVP al backend es **1:1 lógicamente** pero técnicamente muy
distinta (Prisma → TypeORM, monolito → microservicios, Postgres → MySQL).
Cualquier desviación es un **bug** — incluso si "parece mejor" lo nuevo.

Para garantizar paridad, en cada fase corremos:
1. **Unit tests** del service nuevo (con mocks).
2. **Paridad LMSR**: mismo input → mismo output que el MVP.
3. **E2E**: flujo completo vía HTTP.
4. **Validación manual** vía Swagger UI.

---

## 2. Setup base

### Jest config

`apps/api/test/jest-e2e.json` para E2E.
`*.spec.ts` al lado de cada archivo para unit tests.

### Helper — JWT local

```ts
// apps/api/test/helpers/jwt.ts
export function adminJwt(): string {
  // En APP_ENV=local, AuthAdminGuard hace bypass total.
  return 'local-admin';
}
export function userJwt(userId: string): string {
  return jwt.sign({ sub: userId, role: 'USER' }, process.env.JWT_SECRET);
}
```

### Helper — limpiar DB entre tests

```ts
// apps/api/test/helpers/cleanDb.ts
export async function cleanDb(dataSource: DataSource) {
  await dataSource.query(`
    SET FOREIGN_KEY_CHECKS = 0;
    TRUNCATE prediction_lmsr_snapshots;
    TRUNCATE prediction_market_histories;
    TRUNCATE prediction_market_comments;
    TRUNCATE prediction_transactions;
    TRUNCATE prediction_positions;
    TRUNCATE prediction_market_outcomes;
    TRUNCATE prediction_markets;
    SET FOREIGN_KEY_CHECKS = 1;
  `);
}
```

---

## 3. Tests por fase

### Fase 1-2 — Entities + Migration

Manual:

```bash
# 1. Migration corre limpia
npm run typeorm migration:run

# 2. Tablas existen
mysql -e "USE win; SHOW TABLES LIKE 'prediction_%';"

# 3. Schema match con entities
mysql -e "USE win; DESCRIBE prediction_markets;"
# Comparar con predictionMarket.entity.ts. En particular:
# - alpha y bMin son NOT NULL con defaults 0.15 y 1000
# - No hay qYes / qNo / outcome (string) — relación a outcomes via FK

# 4. FKs correctas
mysql -e "USE win;
  SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_NAME LIKE 'prediction_%'
  AND REFERENCED_TABLE_NAME IS NOT NULL;"

# 5. NO existen tablas P2P
mysql -e "USE win; SHOW TABLES LIKE 'prediction_listings';"  # 0 rows
mysql -e "USE win; SHOW TABLES LIKE 'prediction_orders';"     # 0 rows

# 6. Rollback funciona
npm run typeorm migration:revert
mysql -e "USE win; SHOW TABLES LIKE 'prediction_%';"   # vacío
npm run typeorm migration:run                          # reaplicar
```

### Fase 3 — Worker prediction-app

#### Unit tests por service

```ts
// apps/prediction-app/src/positions/positions.service.spec.ts

describe('PredictionPositionsService', () => {
  let service: PredictionPositionsService;
  let positionsRepo: jest.Mocked<Repository<PredictionPosition>>;
  let marketsRepo: jest.Mocked<Repository<PredictionMarket>>;
  let outcomesRepo: jest.Mocked<Repository<PredictionMarketOutcome>>;
  let dataSource: { transaction: jest.Mock };
  let appsClient: jest.Mocked<ClientProxy>;

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb({
        update: jest.fn(),
        save: jest.fn(async (entity) => ({ ...entity, id: 1 })),
        findOne: jest.fn(),
      })),
    };
    // ... setup
  });

  describe('create (LMSR mint)', () => {
    it('throws si market no es ACTIVE', async () => {
      marketsRepo.findOne.mockResolvedValue({ status: 'CLOSED' } as any);
      await expect(service.create({ ... })).rejects.toThrow('no está activo');
    });

    it('throws si user no tiene balance', async () => {
      appsClient.send.mockReturnValue(of({ balance: 10 }));
      await expect(service.create({ ..., amount: 100 })).rejects.toThrow('Balance');
    });

    it('throws si primary market está pausado', async () => {
      marketsRepo.findOne.mockResolvedValue({
        status: 'ACTIVE',
        primaryMarketPaused: true,
      } as any);
      await expect(service.create({ ... })).rejects.toThrow('pausado');
    });

    it('muta q-vector y crea position en happy path', async () => {
      // setup market con outcomes
      const result = await service.create({
        marketId: 1, userId: 1, outcomeId: 1, amount: 50,
      });
      expect(result.shares).toBeGreaterThan(0);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(appsClient.send).toHaveBeenCalledWith(
        'walletUser-debit',
        expect.anything(),
      );
    });
  });

  describe('simulateMarketBuy', () => {
    it('retorna sharesCollected proporcional al budget', () => {
      const sim = service.simulateMarketBuy({
        market: { b: 1000, alpha: 0.15, bMin: 1000, platformFee: 0.015 },
        outcomes: [
          { id: '1', displayOrder: 0, qOutstanding: 0 },
          { id: '2', displayOrder: 1, qOutstanding: 0 },
        ],
        outcomeId: '1',
        budget: 100,
      });
      expect(sim.sharesCollected).toBeGreaterThan(0);
      expect(sim.fee).toBeCloseTo(1.5, 1);  // 1.5% de 100
      expect(sim.newProbabilities['1']).toBeGreaterThan(0.5);
    });
  });
});
```

Cobertura objetivo: **80%**.

#### Tests de paridad LMSR (CRÍTICO)

Mismo input → mismo output, hasta 6 decimales.

```ts
// apps/prediction-app/test/parity-with-mvp.spec.ts
import { LmsrService as MvpLmsr } from './mvp-source/lmsr.service';  // copy del MVP
import { LmsrService } from '../src/lmsr/lmsr.service';

describe('LmsrService paridad con MVP', () => {
  // Defaults nuevos del MVP: α=0.15, bMin=1000
  const cases = [
    { q: [0, 0], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 100 },
    { q: [50, -50], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 100 },
    { q: [500, -100], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 1, shares: 200 },
    // Multi-outcome (3)
    { q: [0, 0, 0], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 1, shares: 50 },
    { q: [100, -50, -50], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 2, shares: 75 },
    // ... 20 casos más con distintos q-vectors
  ];

  cases.forEach((tc, i) => {
    it(`case ${i}: getCostToBuyLSN match`, () => {
      const mvp = new MvpLmsr();
      const backend = new LmsrService();
      const mvpResult = mvp.getCostToBuyLSN(tc.q, tc.params, tc.outcomeIdx, tc.shares);
      const backendResult = backend.getCostToBuyLSN(tc.q, tc.params, tc.outcomeIdx, tc.shares);
      expect(backendResult).toBeCloseTo(mvpResult, 6);
    });

    it(`case ${i}: getPricesLSN match`, () => {
      const mvp = new MvpLmsr();
      const backend = new LmsrService();
      const mvpPrices = mvp.getPricesLSN(tc.q, tc.params);
      const backendPrices = backend.getPricesLSN(tc.q, tc.params);
      mvpPrices.forEach((p, j) => {
        expect(backendPrices[j]).toBeCloseTo(p, 8);
      });
    });

    it(`case ${i}: getRevenueFromSellLSN match`, () => {
      const mvp = new MvpLmsr();
      const backend = new LmsrService();
      const mvpResult = mvp.getRevenueFromSellLSN(tc.q, tc.params, tc.outcomeIdx, tc.shares);
      const backendResult = backend.getRevenueFromSellLSN(tc.q, tc.params, tc.outcomeIdx, tc.shares);
      expect(backendResult).toBeCloseTo(mvpResult, 6);
    });

    it(`case ${i}: getEffectiveBN match`, () => {
      const mvp = new MvpLmsr();
      const backend = new LmsrService();
      expect(backend.getEffectiveBN(tc.q, tc.params))
        .toBeCloseTo(mvp.getEffectiveBN(tc.q, tc.params), 8);
    });
  });
});
```

Esto garantiza que ni un decimal cambia.

### Fase 4-5 — API endpoints

#### Tests E2E del backend

```ts
// apps/api/test/predictionMarkets.e2e-spec.ts
describe('Prediction Markets E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => { await app.close(); });

  beforeEach(async () => { await cleanDb(dataSource); });

  describe('Admin lifecycle', () => {
    it('admin crea, activa y resuelve un mercado binario', async () => {
      // 1. Create
      const created = await request(app.getHttpServer())
        .post('/admin/predictionMarkets')
        .set('Authorization', `Bearer ${adminJwt()}`)
        .send({
          question: 'Test market',
          resolutionDate: '2026-12-31T15:30:00-03:00',  // Argentina TZ
          outcomes: [{ name: 'YES' }, { name: 'NO' }],
          alpha: 0.15,
          bMin: 1000,
        })
        .expect(201);

      const marketId = created.body.id;
      expect(created.body.status).toBe('DRAFT');
      expect(created.body.alpha).toBe(0.15);
      expect(created.body.bMin).toBe(1000);

      // 2. Activate
      await request(app.getHttpServer())
        .patch(`/predictionMarkets/${marketId}`)
        .set('Authorization', `Bearer ${adminJwt()}`)
        .send({ action: 'activate' })
        .expect(200);

      // 3. Verify state endpoint returns effectiveB
      const state = await request(app.getHttpServer())
        .get(`/predictionMarkets/${marketId}/state`)
        .expect(200);
      expect(state.body.effectiveB).toBeGreaterThanOrEqual(1000);
      expect(state.body.Q).toBeGreaterThanOrEqual(0);

      // 4. Resolve
      await request(app.getHttpServer())
        .post(`/predictionMarkets/${marketId}/resolve`)
        .set('Authorization', `Bearer ${adminJwt()}`)
        .send({ winningOutcomeId: created.body.outcomes[0].id })
        .expect(201);

      const final = await request(app.getHttpServer())
        .get(`/predictionMarkets/${marketId}`)
        .expect(200);
      expect(final.body.status).toBe('RESOLVED');
    });
  });

  describe('User happy path', () => {
    let marketId: number, outcomeYes: any, userId: number;

    beforeEach(async () => {
      const u = await dataSource.getRepository(WalletUser).save({
        username: 'tester', balance: 1000,
      });
      userId = u.id;
      const m = await createAndActivateMarket(app, adminJwt(), {
        question: 'E2E test', outcomes: [{ name: 'YES' }, { name: 'NO' }],
      });
      marketId = m.id;
      outcomeYes = m.outcomes.find(o => o.name === 'YES');
    });

    it('user puede LMSR mint, LMSR sell-back, ver balance changes', async () => {
      // 1. Initial balance
      let user = await dataSource.getRepository(WalletUser).findOneBy({ id: userId });
      expect(Number(user.balance)).toBe(1000);

      // 2. LMSR mint $100
      const buy = await request(app.getHttpServer())
        .post('/predictionPositions')
        .set('Authorization', `Bearer ${userJwt(String(userId))}`)
        .set('Idempotency-Key', uuid())
        .send({ marketId, outcomeId: outcomeYes.id, amount: 100 })
        .expect(201);

      expect(buy.body.shares).toBeGreaterThan(0);
      const positionId = buy.body.id;

      // 3. Balance debitado
      user = await dataSource.getRepository(WalletUser).findOneBy({ id: userId });
      expect(Number(user.balance)).toBe(900);

      // 4. Sell half via LMSR
      const sharesToSell = buy.body.shares / 2;
      const sell = await request(app.getHttpServer())
        .post(`/predictionPositions/${positionId}/sell-lmsr`)
        .set('Authorization', `Bearer ${userJwt(String(userId))}`)
        .send({ userId: String(userId), shares: sharesToSell })
        .expect(201);

      expect(sell.body.sharesSold).toBeCloseTo(sharesToSell, 4);
      expect(sell.body.netAmount).toBeGreaterThan(0);

      // 5. Balance creditado
      user = await dataSource.getRepository(WalletUser).findOneBy({ id: userId });
      expect(Number(user.balance)).toBeGreaterThan(900);
    });

    it('idempotency: misma key devuelve response cacheado', async () => {
      const key = uuid();
      const first = await request(app.getHttpServer())
        .post('/predictionPositions')
        .set('Authorization', `Bearer ${userJwt(String(userId))}`)
        .set('Idempotency-Key', key)
        .send({ marketId, outcomeId: outcomeYes.id, amount: 50 })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/predictionPositions')
        .set('Authorization', `Bearer ${userJwt(String(userId))}`)
        .set('Idempotency-Key', key)
        .send({ marketId, outcomeId: outcomeYes.id, amount: 50 })
        .expect(201);

      expect(first.body.id).toBe(second.body.id);

      // Balance debitado solo UNA vez
      const user = await dataSource.getRepository(WalletUser).findOneBy({ id: userId });
      expect(Number(user.balance)).toBe(950);
    });

    it('insufficient balance es rechazado', async () => {
      await request(app.getHttpServer())
        .post('/predictionPositions')
        .set('Authorization', `Bearer ${userJwt(String(userId))}`)
        .set('Idempotency-Key', uuid())
        .send({ marketId, outcomeId: outcomeYes.id, amount: 5000 })
        .expect(400);
    });
  });

  describe('Resolution report (post-P2P)', () => {
    it('fees del report tienen primaryBuy + primarySell + total', async () => {
      // ... setup market, hacer buys y sells, resolver
      const report = await request(app.getHttpServer())
        .get(`/predictionMarkets/${marketId}/resolve`)
        .expect(200);

      expect(report.body.fees).toHaveProperty('primaryBuy');
      expect(report.body.fees).toHaveProperty('primarySell');
      expect(report.body.fees).toHaveProperty('total');
      expect(report.body.fees).not.toHaveProperty('secondary');  // ya no existe
      expect(report.body.fees.total).toBeCloseTo(
        report.body.fees.primaryBuy + report.body.fees.primarySell,
        4,
      );
    });
  });
});
```

### Fase 7 — Cache

```ts
describe('Cache layer', () => {
  it('findOne cachea', async () => {
    const spy = jest.spyOn(marketsRepo, 'findOne');
    await service.findOne(1);
    await service.findOne(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('updateMeta invalida', async () => {
    await service.findOne(1);
    await service.updateMeta(1, { question: 'new' });
    const spy = jest.spyOn(marketsRepo, 'findOne');
    await service.findOne(1);
    expect(spy).toHaveBeenCalled();
  });
});
```

Manual E2E (Redis activo):

```bash
# Primer hit: ~80ms
time curl http://localhost/predictionMarkets/1/state

# Segundo hit: ~3ms
time curl http://localhost/predictionMarkets/1/state

# Trigger trade
curl -X POST -H "..." http://localhost/predictionPositions -d '...'

# Cache state debe estar invalidado en <2s (TTL)
time curl http://localhost/predictionMarkets/1/state   # cambió
```

### Fase 8 — WebSocket

```ts
describe('PredictionMarketsGateway E2E', () => {
  it('cliente recibe trade event tras LMSR mint', async () => {
    const client = io(`http://localhost:3000/predictionMarkets`, {
      auth: { token: userJwt('1') },
    });

    await new Promise<void>((resolve) => { client.on('connect', resolve); });
    client.emit('subscribeMarket', String(marketId));

    const tradePromise = new Promise<any>((resolve) => {
      client.on('trade', resolve);
    });

    // Trigger
    await request(app.getHttpServer())
      .post('/predictionPositions')
      .set('Authorization', `Bearer ${userJwt('1')}`)
      .set('Idempotency-Key', uuid())
      .send({ marketId, outcomeId: outcomeYes.id, amount: 50 })
      .expect(201);

    const trade = await Promise.race([
      tradePromise,
      new Promise((_, reject) => setTimeout(() => reject('timeout'), 1000)),
    ]);

    expect(trade.shares).toBeGreaterThan(0);
    expect(trade.newPrices).toBeDefined();

    client.disconnect();
  });
});
```

---

## 4. Load tests

### k6 — happy path concurrente

`load/marketBuy.js`:

```js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const USERS = JSON.parse(open('./users.json'));
const MARKET_ID = __ENV.MARKET_ID;
const OUTCOME_ID = __ENV.OUTCOME_ID;

export default function () {
  const user = USERS[__VU % USERS.length];
  const payload = JSON.stringify({
    marketId: MARKET_ID,
    outcomeId: OUTCOME_ID,
    amount: Math.random() * 50 + 10,
  });
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${user.jwt}`,
    'Idempotency-Key': uuidv4(),
  };
  const res = http.post(`${__ENV.API_URL}/predictionPositions`, payload, { headers });
  check(res, { 'status is 201': (r) => r.status === 201 });
  sleep(Math.random() * 2);
}
```

```bash
k6 run -e API_URL=http://localhost:3000 -e MARKET_ID=1 -e OUTCOME_ID=2 load/marketBuy.js
```

Targets:
- p95 < 300ms
- error rate < 1%
- Sostener 50 req/s durante 2 min

### Race condition test

20 VUs en burst contra el mismo market. Después validar via SQL:

```sql
SELECT SUM(shares) FROM prediction_positions WHERE market_id = ?;
SELECT q_outstanding FROM prediction_market_outcomes WHERE id = ?;
-- La diferencia debe ser igual al qOutstanding inicial.
```

---

## 5. Validación manual vía Swagger

`http://localhost/docs` (público) y `http://localhost/docsDashboard` (admin).

Checklist por endpoint:
- [ ] Aparece con `@ApiTags` correcto
- [ ] Bearer auth visible donde corresponde
- [ ] Request body documentado con ejemplos
- [ ] Response schemas definidos
- [ ] Try-it-out funciona en happy path
- [ ] Validation errors devuelven 400 con detalles

---

## 6. Smoke tests post-cutover (producción)

```bash
#!/bin/bash
# smoke.sh
set -e

API=https://api.win.investments
ADMIN_JWT=...
USER_JWT=...

echo "=== Health ==="
curl -fsS $API/api/health | jq .

echo "=== List markets ==="
curl -fsS $API/predictionMarkets | jq 'length'

echo "=== Get market ==="
MARKET_ID=$(curl -fsS $API/predictionMarkets | jq -r '.[0].id')
curl -fsS $API/predictionMarkets/$MARKET_ID | jq '.id, .status'

echo "=== Price quote ==="
OUTCOME_ID=$(curl -fsS $API/predictionMarkets/$MARKET_ID | jq -r '.outcomes[0].id')
curl -fsS "$API/predictionMarkets/$MARKET_ID/price-quote?outcomeId=$OUTCOME_ID&amount=10" \
  | jq '.shares, .avgPrice'

echo "=== State (effectiveB visible) ==="
curl -fsS $API/predictionMarkets/$MARKET_ID/state | jq '.effectiveB, .Q'

echo "=== Admin list ==="
curl -fsS -H "Authorization: Bearer $ADMIN_JWT" $API/admin/predictionMarkets | jq 'length'

echo "=== All good ==="
```

---

## 7. Plan de incidente

### Síntoma: LMSR mint devuelve 500

1. Logs del worker: `kubectl logs -l app=prediction-app --tail=100`
2. Buscar TypeORM errors (FK, deadlock, timeout)
3. Si deadlock: probable concurrencia → verificar SELECT FOR UPDATE
4. Si FK violation: query la fila ofensora
5. Rollback al worker anterior si crítico

### Síntoma: precios desactualizados en webapp

1. WebSocket: `wscat -c wss://api.win.investments/predictionMarkets`
2. Redis pub/sub: `redis-cli psubscribe 'predMarket:*:*'`
3. Si pub/sub OK pero WS no recibe: gateway down → restart instancia API
4. Si pub/sub no recibe: worker no publica → restart worker

### Síntoma: balance inconsistente

**NO debe pasar nunca**. Si pasa:

1. **Parar todas las escrituras** (rate-limit a 0).
2. Reconciliar: `sum(prediction_transactions.amount)` por usuario debe coincidir con `current_balance - initial_balance`.
3. Si no coinciden: buscar transactions huérfanas o balances mutados sin audit.
4. Audit forensic con logs estructurados.
5. Reabrir solo después de root cause identificado.

---

## 8. Cobertura esperada

| Componente | Cobertura mínima |
|---|---|
| LmsrService | 95% + paridad con MVP |
| MarketsService (worker) | 80% |
| PositionsService (worker) | 90% (es el hot path money) |
| SettlementService | 85% |
| BalanceService | 90% (cualquier bug acá desastroso) |
| Controllers (API) | 70% |
| DTOs | 100% (class-validator es trivial) |

---

_Última actualización: post-cleanup LS-LMSR-only + remoción P2P._
