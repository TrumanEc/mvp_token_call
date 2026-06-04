# Real-Time Architecture — Prediction Markets

> Guía técnica de las mejoras post-migración para que la experiencia sea
> rápida y siempre fresca. Complementa el [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)
> fases 7-9.

---

## 1. Por qué importa

Un prediction market activo tiene:
- **Lectura masiva** — todos los usuarios viendo el mismo mercado quieren
  el mismo precio en simultáneo.
- **Escritura concurrente en el AMM** — varias compras al mismo tiempo
  serializan en la curva LMSR (todas mutan el q-vector).
- **Latencia visible** — un quote >500ms se siente roto.
- **Idempotencia crítica** — un bet repetido por retry de red es plata
  perdida.

---

## 2. Hot paths

| Endpoint | Frecuencia | Bottleneck sin atacar |
|---|---|---|
| `GET /predictionMarkets/:id/price-quote?amount=X&side=Y` | Cada cambio del slider | Query DB + cómputo LMSR cada vez |
| `GET /predictionMarkets/:id/state` | Cada page-view + polling | DB hit + recomputo |
| `GET /predictionMarkets/:id` | Listado, sliders, modales | Query con relations grande |
| `GET /predictionMarkets/:id/activity` | Polling del feed | LIMIT 20 sobre tabla grande |
| `POST /predictionPositions` (LMSR mint) | Picos en eventos | Serializa en Market row |
| `POST /predictionPositions/:id/sell-lmsr` | Similar | Idem |
| `GET /walletUsers/:id/balance` | Cada acción | Lectura simple, muy frecuente |

---

## 3. Capa 1 — Cache Redis (read-through + write-invalidate)

### Diseño

```
Cliente → Controller → Service
                         │
                         ▼ Cache get
                    HIT → return cached
                    MISS → TypeORM repo → MySQL → cache.set → return

Mutation: Service.update() → repo.save() → cache.del(keys afectadas)
```

### Keys y TTL

| Key | Contenido | TTL | Invalidada por |
|---|---|---|---|
| `predMarket:meta:<id>` | question, status, outcomes, rules | 30s | updateMeta, activate, close, resolve |
| `predMarket:state:<id>` | q-vector, prices, totalPool, effectiveB | 2s | create position, sell-lmsr |
| `predMarket:list:active` | array de meta de markets activos | 10s | activate, close, resolve, updateMeta |
| `predMarket:activity:<id>` | últimas 20 transactions del mercado | 3s | toda Position creada |
| `walletUser:balance:<userId>` | balance | 5s | toda credit/debit |
| `walletUser:positions:<userId>` | consolidated positions | 5s | create/sell-lmsr de Position |

### Setup

`libs/common/src/common.module.ts`:

```ts
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        store: redisStore,
        host: process.env.REDIS_HOST,
        port: +process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD,
        ttl: 0,  // explícito por call
      }),
    }),
  ],
})
```

### Patrón read-through

```ts
@Injectable()
export class PredictionMarketsService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @InjectRepository(PredictionMarket) private readonly marketsRepo: Repository<PredictionMarket>,
    private readonly lmsrService: LmsrService,
  ) {}

  async findOne(id: string) {
    const key = `predMarket:meta:${id}`;
    const cached = await this.cache.get<PredictionMarket>(key);
    if (cached) return cached;

    const market = await this.marketsRepo.findOne({
      where: { id },
      relations: ['outcomes'],
    });
    if (market) await this.cache.set(key, market, 30_000);
    return market;
  }

  async getState(id: string) {
    const key = `predMarket:state:${id}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const market = await this.findOne(id);
    if (!market) throw new NotFoundException();
    const qVector = market.outcomes
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(o => o.qOutstanding);
    const params = { b: market.b, alpha: market.alpha, bMin: market.bMin };
    const state = {
      qVector,
      prices: this.lmsrService.getPricesLSN(qVector, params),
      effectiveB: this.lmsrService.getEffectiveBN(qVector, params),
      totalPool: market.totalPool,
    };
    await this.cache.set(key, state, 2_000);
    return state;
  }
}
```

### Patrón write-invalidate

```ts
async updateMeta(id: string, body: UpdateMetaDto) {
  await this.marketsRepo.update({ id }, body);
  await Promise.all([
    this.cache.del(`predMarket:meta:${id}`),
    this.cache.del(`predMarket:list:active`),
  ]);
  return this.findOne(id);
}
```

### Quotes — cachear el INPUT, no el output

```ts
async getPriceQuote(id: string, query: PriceQuoteQuery) {
  // No cacheamos el resultado (depende del amount variable).
  // Sí cacheamos el state que usamos como base.
  const market = await this.findOne(id);    // cache hit
  const state = await this.getState(id);    // cache hit
  return PositionService.simulateMarketBuy({
    market,
    outcomes: market.outcomes,
    outcomeId: query.outcomeId,
    budget: query.amount,
  });
}
```

Quote endpoint cae de ~80ms a ~3ms en hit.

### Métricas (Prometheus)

- Cache hit rate por prefix (target `predMarket:meta` >85%)
- p95 latency por endpoint (`state` <5ms, `findOne` <3ms en hit)
- Evictions de Redis (deben ser cero)

---

## 4. Capa 2 — WebSocket gateway

### Diseño

```
Worker prediction-app (después de COMMIT)
  └→ Redis publish 'predMarket:<id>:trade'
       │
       ▼
  Redis pub/sub
       │
       ▼ psubscribe 'predMarket:*:*'
  apps/api (N instancias)
       │
       ▼ server.to(`market:<id>`).emit(event, payload)
  Socket.io rooms (con Redis adapter)
       │
       ▼
  Clientes (webapp + dashboard admin)
```

### Por qué Redis pub/sub y NO `this.apps.send`

`apps.send` es 1:1 request/response. Para broadcast (1 trade → N clientes
conectados a M instancias del API) necesitás 1:N: eso es pub/sub.

Socket.io necesita el **Redis adapter** (`@socket.io/redis-adapter`) para
que los rooms se compartan entre instancias.

### Setup

#### Módulo pub/sub

`libs/common/src/redis/redis.module.ts`:

```ts
import { Module } from '@nestjs/common';
import Redis from 'ioredis';

const redisConfig = () => ({
  host: process.env.REDIS_HOST,
  port: +process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});

@Module({
  providers: [
    { provide: 'REDIS_PUB', useFactory: () => new Redis(redisConfig()) },
    { provide: 'REDIS_SUB', useFactory: () => new Redis(redisConfig()) },
  ],
  exports: ['REDIS_PUB', 'REDIS_SUB'],
})
export class RedisPubSubModule {}
```

#### Gateway

`apps/api/src/realtime/predictionMarkets.gateway.ts`:

```ts
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  ConnectedSocket, MessageBody, OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, UseGuards } from '@nestjs/common';
import { Redis } from 'ioredis';
import { WsAuthGuard } from '../guards/auth/wsAuth.guard';

@WebSocketGateway({
  namespace: 'predictionMarkets',
  cors: { origin: '*' },
})
export class PredictionMarketsGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(@Inject('REDIS_SUB') private readonly sub: Redis) {}

  onGatewayInit(server: Server) {
    this.sub.psubscribe('predMarket:*:*');
    this.sub.psubscribe('walletUser:*:*');

    this.sub.on('pmessage', (_pattern, channel, message) => {
      const parts = channel.split(':');
      const namespace = parts[0];
      const entityId = parts[1];
      const event = parts.slice(2).join(':');

      const room = namespace === 'predMarket' ? `market:${entityId}` : `user:${entityId}`;
      try {
        const payload = JSON.parse(message);
        server.to(room).emit(event, payload);
      } catch (err) {
        console.error('Failed to relay WS message:', err);
      }
    });
  }

  @SubscribeMessage('subscribeMarket')
  handleSubscribeMarket(
    @ConnectedSocket() client: Socket,
    @MessageBody() marketId: string,
  ) {
    if (!marketId) return { ok: false, error: 'marketId required' };
    client.join(`market:${marketId}`);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribeMarket')
  handleUnsubscribeMarket(
    @ConnectedSocket() client: Socket,
    @MessageBody() marketId: string,
  ) {
    client.leave(`market:${marketId}`);
    return { ok: true };
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('subscribeUser')
  handleSubscribeUser(@ConnectedSocket() client: Socket) {
    const userId = (client as any).user?.sub;
    if (!userId) return { ok: false };
    client.join(`user:${userId}`);
    return { ok: true };
  }
}
```

#### WsAuthGuard

```ts
@Injectable()
export class WsAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.auth?.token;
    if (!token) return false;
    try {
      const payload = await verifyCognitoJwt(token);
      (client as any).user = payload;
      return true;
    } catch {
      return false;
    }
  }
}
```

#### Socket.io Redis adapter (escalado horizontal)

`apps/api/src/main.ts`:

```ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

class RedisIoAdapter extends IoAdapter {
  private adapter: any;

  async connectToRedis() {
    const pub = createClient({ url: process.env.REDIS_URL });
    const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.adapter = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: any) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapter);
    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const adapter = new RedisIoAdapter(app);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);
  await app.listen(3000);
}
```

#### Publicar desde el worker

`apps/prediction-app/src/positions/positions.service.ts`:

```ts
@Injectable()
export class PredictionPositionsService {
  constructor(
    @InjectRepository(PredictionPosition) private readonly positionsRepo: ...,
    @Inject('REDIS_PUB') private readonly pub: Redis,
    // ...
  ) {}

  async create(data) {
    const result = await this.dataSource.transaction(async (manager) => {
      // ... toda la lógica de mint
      return { position, newPrices, totalPool };
    });

    // Publish FUERA de la tx para no demorarla
    await this.pub.publish(
      `predMarket:${data.marketId}:trade`,
      JSON.stringify({
        positionId: result.position.id,
        userId: data.userId,
        outcomeId: data.outcomeId,
        shares: result.position.shares,
        cost: data.amount,
        newPrices: result.newPrices,
        totalPool: result.totalPool,
      }),
    );

    await this.pub.publish(
      `walletUser:${data.userId}:balanceUpdated`,
      JSON.stringify({ balance: result.newBalance }),
    );

    return result.position;
  }
}
```

### Eventos canónicos (post-P2P)

```
predMarket:<id>:trade             — buy o sell-lmsr completado
predMarket:<id>:priceUpdate       — alias del anterior (algunos clientes
                                     prefieren escuchar solo precios)
predMarket:<id>:marketResolved    — outcome decidido, payouts iniciados
predMarket:<id>:paused            — primary market paused
predMarket:<id>:unpaused          — primary market reanudado
predMarket:<id>:closed            — status → CLOSED
walletUser:<id>:balanceUpdated    — balance cambió
walletUser:<id>:positionUpdated   — una posición del user cambió
```

**Eventos eliminados (P2P)**: `~~listing:created~~`, `~~listing:sold~~`,
`~~order:placed~~`, `~~order:filled~~`, `~~order:cancelled~~`.

### Cliente — webapp (`win-field`)

`hooks/usePredictionMarketSocket.ts`:

```ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { getCognitoToken } from '@/lib/auth/session';

let socket: Socket | null = null;

function getSocket() {
  if (socket?.connected) return socket;
  socket = io(`${process.env.NEXT_PUBLIC_API_URL}/predictionMarkets`, {
    auth: { token: getCognitoToken() },
    transports: ['websocket'],
  });
  return socket;
}

export function usePredictionMarketSocket(marketId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const s = getSocket();
    s.emit('subscribeMarket', marketId);

    const onTrade = (payload: any) => {
      queryClient.setQueryData(['predictionMarket', marketId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          outcomes: old.outcomes.map((o: any) => ({
            ...o,
            price: payload.newPrices[o.id] ?? o.price,
            probability: (payload.newPrices[o.id] ?? o.price) * 100,
          })),
          totalPool: payload.totalPool ?? old.totalPool,
        };
      });
      queryClient.invalidateQueries(['predictionMarket', marketId, 'activity']);
    };

    s.on('trade', onTrade);
    s.on('marketResolved', () => {
      queryClient.invalidateQueries(['predictionMarket', marketId]);
    });

    return () => {
      s.emit('unsubscribeMarket', marketId);
      s.off('trade', onTrade);
      s.off('marketResolved');
    };
  }, [marketId, queryClient]);
}
```

### Métricas

- Conexiones activas (`socket.io.engine.clientsCount`)
- Mensajes publicados/seg a Redis
- Lag publish → deliver (instrumentar timestamp en payload)
- Failed handshakes (`connection_error` count)

---

## 5. Capa 3 — Idempotency keys

### Por qué

En mobile la red se corta. El cliente reintenta el POST. Sin idempotency
el usuario paga dos veces. Se descubre en producción con quejas raras.

### Schema

```ts
@Entity({ name: 'prediction_idempotency', synchronize: false })
@Index('uniq_key_user', ['idempotencyKey', 'userId'], { unique: true })
@Index('idx_expires', ['expiresAt'])
export class PredictionIdempotency {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64 })
  idempotencyKey: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: number;

  @Column({ name: 'endpoint', type: 'varchar', length: 128 })
  endpoint: string;

  @Column({ name: 'response_json', type: 'json' })
  responseJson: any;

  @Column({ name: 'status_code', type: 'smallint' })
  statusCode: number;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### Interceptor

```ts
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(PredictionIdempotency)
    private readonly repo: Repository<PredictionIdempotency>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'];
    const userId = req.user?.sub;
    const endpoint = `${req.method} ${req.route?.path ?? req.url}`;

    if (!key || !userId) return next.handle();

    const existing = await this.repo.findOne({
      where: { idempotencyKey: key, userId },
    });
    if (existing) {
      if (existing.endpoint !== endpoint) {
        throw new ConflictException('Idempotency-Key reused with different endpoint');
      }
      return of(existing.responseJson);
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.repo.save({
            idempotencyKey: key,
            userId,
            endpoint,
            responseJson: response,
            statusCode: 201,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
        } catch {
          // Race: otro request lo escribió. OK, ignorar.
        }
      }),
    );
  }
}
```

### Aplicar selectivamente

Solo en endpoints money-affecting (post-P2P son solo 2):

```ts
@Post()
@UseGuards(AuthGuard)
@UseInterceptors(IdempotencyInterceptor)
@ApiHeader({ name: 'Idempotency-Key', required: false })
create(@Body() body: CreatePositionDto) {
  return this.positionsService.create(body);
}

@Post(':id/sell-lmsr')
@UseGuards(AuthGuard)
@UseInterceptors(IdempotencyInterceptor)
sellLmsr(...) { ... }
```

### Limpieza

```ts
@Cron('0 3 * * *')  // 3am diario
async cleanupExpired() {
  await this.repo.delete({ expiresAt: LessThan(new Date()) });
}
```

### Cliente

```ts
async function createPosition(payload) {
  const idempotencyKey = uuid();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await axios.post('/predictionPositions', payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
        timeout: 10_000,
      });
    } catch (err) {
      if (err.code === 'ECONNABORTED' && attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}
```

---

## 6. Capa 4 — BullMQ write-behind

### Por qué

La tx crítica de un LMSR mint hace:
1. UPDATE PredictionMarketOutcome (qOutstanding + pool)
2. UPDATE PredictionMarket (totalPool)
3. UPDATE WalletUser (balance) — via BalanceService
4. INSERT PredictionTransaction — via BalanceService
5. INSERT PredictionPosition
6. INSERT PredictionLmsrSnapshot

El (6) es audit puro — útil para charts pero no afecta UX. Sacarlo de la
tx reduce lock contention.

### Patrón

```ts
await this.dataSource.transaction(async (manager) => {
  // 1-5 críticos
});

// Fuera de la tx:
await this.mainQueue.add('persist-lmsr-snapshot', {
  marketId, outcomeId, userId,
  qBefore, pBefore, qAfter, pAfter,
  side, deltaShares, cost,
  triggerType: 'MARKET_BUY',
  createdAt: new Date().toISOString(),
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});
```

### Processor

`libs/common/src/queue/main.processor.ts`:

```ts
@Processor('main')
export class MainProcessor {
  constructor(
    @InjectRepository(PredictionLmsrSnapshot)
    private readonly snapshotsRepo: Repository<PredictionLmsrSnapshot>,
    @InjectRepository(PredictionMarketHistory)
    private readonly historyRepo: Repository<PredictionMarketHistory>,
  ) {}

  @Process('persist-lmsr-snapshot')
  async persistLmsrSnapshot(job: Job) {
    await this.snapshotsRepo.save(job.data);
  }

  @Process('persist-market-history')
  async persistMarketHistory(job: Job) {
    await this.historyRepo.save(job.data);
  }
}
```

### Failure mode

- Worker BullMQ caído → jobs se acumulan en Redis, procesan al revivir
- Worker Y Redis caídos → `mainQueue.add` falla; log + seguir (chart pierde data,
  pero el trade ya commiteó)

### Qué SÍ y qué NO async

| Operación | Sync (en tx) | Async (BullMQ) |
|---|---|---|
| Update q-vector + pools | ✓ | |
| Update balance | ✓ | |
| Insert PredictionTransaction | ✓ (audit del balance) | |
| Insert PredictionPosition | ✓ | |
| Insert PredictionLmsrSnapshot | | ✓ |
| Insert PredictionMarketHistory | | ✓ |
| Email / push (futuro) | | ✓ |
| Webhook Slack (admin alerts) | | ✓ |

---

## 7. Rate limiting

```ts
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: 60 }],  // 60 req/min default
        storage: new ThrottlerStorageRedisService(redisClient),
      }),
    }),
  ],
})
```

Específico en quote (CPU-intensive):

```ts
@Get(':id/price-quote')
@Throttle({ default: { limit: 120, ttl: 60_000 } })  // 2 req/s
async getPriceQuote(...) { ... }
```

---

## 8. Métricas mínimas

### Sistema

- CPU / Memory por instancia
- DB connection pool usage
- Redis memory + evictions
- BullMQ queue depth + processing time

### Negocio

- Markets activos
- Volumen 24h (sum Position.amount creadas en 24h)
- Trades/min por mercado top-10
- Settlement reports generados

### Latency

- p50/p95/p99 por endpoint (especialmente `price-quote`, `state`, `create position`)
- WebSocket lag publish → deliver
- Cache hit rate por prefix

### Stack

`@willsoto/nestjs-prometheus`:

```ts
@Module({
  imports: [PrometheusModule.register({ defaultMetrics: { enabled: true } })],
})
```

`/metrics` protegido con basic auth o IP allowlist.

---

## 9. Orden recomendado

| Fase | Esfuerzo | ROI | Cuándo |
|---|---|---|---|
| Cache market state + balance | 1.5 día | ★★★★★ | Inmediato post-MVP backend |
| WebSocket gateway + eventos básicos | 2 días | ★★★★★ | Cuando >500 usuarios concurrentes |
| Idempotency keys | ½ día | ★★★★ | ANTES de abrir a usuarios reales |
| BullMQ write-behind snapshots | ½ día | ★★ | Cuando p95 del buy >200ms |
| Rate limiting | ¼ día | ★★★ | Antes de exponer público |
| Métricas Prometheus | ½ día | ★★★★ | Junto con WebSocket |

---

## 10. Anti-patrones

- ❌ **Matching engine en memoria** — sin orderbook ya no aplica.
- ❌ **Event sourcing** — agregás 3 meses sin beneficio claro.
- ❌ **Sharding por mercado** — los LMSR markets no shardean (q-vector compartido).
- ❌ **Cachear quotes completos** — dependen del `amount` input. Cachear el INPUT (market state) sí; el output no.
- ❌ **WebSocket sin Redis adapter** — funciona en 1 instancia, rompe al escalar.
- ❌ **Idempotency en TODO endpoint** — solo en writes money-affecting. Lecturas son naturalmente idempotentes.
- ❌ **Write-behind si afecta UX de charts** — verificar lag aceptable (1-5s OK).

---

## 11. Checklist de "listo para producción"

### Performance

- [ ] p95 de `/predictionMarkets/:id` < 50ms
- [ ] p95 de `/predictionMarkets/:id/state` < 10ms (con cache)
- [ ] p95 de `/predictionMarkets/:id/price-quote` < 30ms
- [ ] p95 de `POST /predictionPositions` < 200ms
- [ ] Cache hit rate > 85%

### Reliability

- [ ] Idempotency en `POST /predictionPositions` y `sell-lmsr`
- [ ] Rate limiting en públicos
- [ ] E2E del happy path: buy → sell-back → resolve → payout
- [ ] Race test (10 buyers concurrentes en el mismo market) → consistencia OK
- [ ] WebSocket resiste reconexión

### Observability

- [ ] Métricas a Prometheus
- [ ] Logs estructurados (JSON) con correlation IDs
- [ ] Alertas en Slack: p99 > umbral, BullMQ failed > N, DB lock waits
- [ ] Health endpoint verifica DB + Redis

### Operations

- [ ] Runbook "worker caído"
- [ ] Runbook "balance inconsistente" (idealmente nunca pasa)
- [ ] Backup MySQL diario + retención 30 días
- [ ] Capacidad de rollback de migrations TypeORM

---

_Última actualización: post-cleanup LS-LMSR-only + remoción P2P._
