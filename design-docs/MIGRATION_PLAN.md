# Migration Plan — MVP → api.win.investments

> Plan de migración del MVP (`mvp_token_call`) al backend principal
> (`api.win.investments`). Pensado para ejecutarse con asistencia de IA.
> Cada fase incluye prompts listos para copiar, checklist de validación,
> y criterios de aceptación.
>
> **Modelo a migrar**: LS-LMSR multi-outcome puro. Sin P2P.

---

## 0. Contexto

### Stack mapping

| MVP | Backend target |
|---|---|
| Prisma + Postgres | TypeORM + MySQL |
| Next route handlers | NestJS `@Controller` |
| Zod + types | `class-validator` + `@ApiProperty` |
| Imports directos entre services | Redis ClientProxy (`@MessagePattern`) |
| NextAuth + Cognito | Cognito JWT puro |
| `prisma.$transaction` | `dataSource.transaction()` |
| Singleton in-memory | Redis cache + WebSocket fan-out |

### Estimación

Con asistencia de IA y siguiendo el plan: **5 a 7 días** para el backend
funcional. **+3 días** para la capa real-time. Data migration aparte.

---

## 1. Pre-migration checklist

- [ ] Acceso al repo `api.win.investments`
- [ ] Branch dedicada: `feature/prediction-markets-from-mvp`
- [ ] `bun start:dev` levanta infra (Docker) + apps
- [ ] MySQL local con schema actual aplicado
- [ ] Redis local activo
- [ ] Dump de Supabase del MVP (export de las tablas)
- [ ] `REPO_STRUCTURE_backend.md` revisado
- [ ] Swagger del backend accesible: `http://localhost/docs` y `/docsDashboard`

---

## 2. Plan por fases

```
Fase 1 → Entities en libs/common         (1 día)
Fase 2 → Migration TypeORM               (½ día)
Fase 3 → Worker prediction-app           (1-2 días)
Fase 4 → API admin endpoints             (1 día)
Fase 5 → API público endpoints           (1 día)
Fase 6 → Tests + Swagger + cleanup       (1 día)
─── MVP listo para QA en backend ──────────────────
Fase 7 → Redis cache layer               (1 día)
Fase 8 → WebSocket gateway               (1-2 días)
Fase 9 → Idempotency + BullMQ            (½ día)
Fase 10 → Data migration desde Supabase  (variable)
```

---

## 3. Fase 1 — Entities

### Objetivo
Crear/extender entidades TypeORM en `libs/common/src/entities/`.

### Mapping de modelos

| MVP Prisma model | Backend TypeORM | Acción |
|---|---|---|
| `User` | `WalletUser` (ya existe) | rename solo en interface MVP-side |
| `Market` | `PredictionMarket` (existe, **binario**) | **EXTENDER** a multi-outcome |
| `Position` | `PredictionPosition` (existe, **binario**) | extender |
| `MarketOutcome` | **NUEVO** | crear `predictionMarketOutcome.entity.ts` |
| `LmsrSnapshot` | `PredictionLmsrSnapshot` (existe) | verificar fields |
| `Transaction` | `PredictionTransaction` (existe) | extender enum types |
| `MarketHistory` | `PredictionMarketHistory` (existe) | verificar |
| `MarketComment` | **NUEVO** | crear `predictionMarketComment.entity.ts` |
| `PlatformConfig` | usar `configuration` general | merge |

**NO crear** (eran P2P): `Order`, `MarketplaceListing`, `PositionTransfer`,
`MarketRouterAuditLog`, `OrderType (enum)`.

### Cambios mecánicos por entidad

- **IDs**: `cuid String` → `bigint unsigned` autoincrement
- **Columnas**: `@Column({ name: 'snake_case', type, length/precision })`
- **Decimal**: `'decimal'` con `transformer { from: parseFloat, to: n => n.toFixed(N) }`
- **Fechas**: `@CreateDateColumn({ name: 'created_at' })`, `@UpdateDateColumn`
- **Relaciones**: `@ManyToOne`/`@OneToMany` con `@JoinColumn({ name: 'snake_case_id' })`
- **alpha y bMin son NOT NULL** con defaults 0.15 y 1000

### Prompt para IA

```
Tengo este modelo Prisma del MVP:

[pegar bloque del modelo en schema.prisma]

Y este ejemplo de entity TypeORM del backend:

[pegar libs/common/src/entities/walletUser.entity.ts del backend]

Convertir el del MVP al estilo del backend con estas reglas estrictas:
1. ID: bigint unsigned autoincrement (no cuid). FKs a otros bigint.
2. @Column con name snake_case, type, length/precision.
3. Decimal con transformer parseFloat/toFixed(N).
4. @CreateDateColumn / @UpdateDateColumn con name snake_case.
5. Relations: @ManyToOne/@OneToMany + @JoinColumn.
6. Implementar interface en libs/common/src/interfaces/X.interface.ts.
7. @Entity({ name: 'prediction_<plural>', synchronize: false }).
8. Para PredictionMarket: alpha y bMin son NOT NULL con defaults 0.15 y 1000.
   Drop fields binarios: qYes, qNo, outcome (string). Agregar relación OneToMany
   con PredictionMarketOutcome[].
9. Mantener nombres camelCase de propiedades, snake_case en columnas SQL.

Generá: entity + interface + el CREATE TABLE SQL para la migration.
```

### Acceptance criteria

- [ ] 7 entities creadas/extendidas
- [ ] 7 interfaces en `libs/common/src/interfaces/`
- [ ] Registradas en `libs/common/src/common.module.ts`
- [ ] `npm run build` compila
- [ ] `npm run lint` pasa

---

## 4. Fase 2 — Migration TypeORM

```bash
npm run typeorm migration:generate libs/common/src/migrations/AddPredictionDomainMultiOutcome
```

**Revisar manualmente** el SQL:
- Tipos numéricos (`decimal(12,4)` no `decimal(10,2)`)
- Charset `utf8mb4_unicode_ci`, engine `InnoDB`
- Índices: `status`, `userId`, `marketId`, `outcomeId`, `createdAt`
- `ON DELETE CASCADE` en FKs apuntando a `prediction_markets`
- Si la migration toca el binario actual (drop columns `q_yes`, `q_no`), revisar
  si hay datos en prod — coordinar con el equipo del backend

```bash
npm run typeorm migration:run
mysql -e "SHOW TABLES LIKE 'prediction_%';"
```

### Acceptance criteria

- [ ] Migration corre limpia en MySQL local
- [ ] FKs visibles con `SHOW CREATE TABLE`
- [ ] `bun run dev-main` levanta sin errores

---

## 5. Fase 3 — Worker `prediction-app`

### Archivos a portar

| MVP source | Target |
|---|---|
| `apps/prediction-app/src/lmsr/lmsr.service.ts` | idem |
| `apps/prediction-app/src/markets/markets.service.ts` | idem |
| `apps/prediction-app/src/positions/positions.service.ts` | idem (incluye `create` LMSR mint directo) |
| `apps/prediction-app/src/settlement/settlement.service.ts` | idem |

### Cambios mecánicos

1. **`@Injectable()`** en cada service
2. **Constructor injection**:
   ```ts
   constructor(
     @InjectRepository(PredictionMarket) private marketsRepo: Repository<PredictionMarket>,
     // ... otros repos
     private readonly lmsrService: LmsrService,
     @Inject('APPS') private readonly apps: ClientProxy,  // si llama a otros workers
     @InjectQueue('main') private readonly mainQueue: Queue,  // si publica jobs
   ) {}
   ```
3. **Prisma → TypeORM**:
   - `prisma.market.findUnique({ where, include: { outcomes } })` →
     `this.marketsRepo.findOne({ where, relations: ['outcomes'] })`
   - `prisma.position.create({ data })` →
     `this.positionsRepo.save(this.positionsRepo.create(data))`
4. **Transactions**:
   ```ts
   await this.dataSource.transaction(async (manager) => {
     await manager.update(PredictionMarket, ...);
   });
   ```
5. **Cross-service (BalanceService)** vía Redis:
   ```ts
   await firstValueFrom(this.apps.send('walletUser-debit', payload));
   ```
6. **`@MessagePattern`** en un controller del worker:
   ```ts
   @MessagePattern('predictionPosition-create')
   create(data) { return this.positionsService.create(data); }
   ```

### Mensajes canónicos

```
predictionMarket-create
predictionMarket-findAll
predictionMarket-findOne
predictionMarket-updateMeta
predictionMarket-activate
predictionMarket-close
predictionMarket-pausePrimary
predictionMarket-unpausePrimary
predictionMarket-resolve
predictionMarket-getReport
predictionMarket-findInactive
predictionMarket-recoverInactive

predictionPosition-create        ← LMSR mint directo (NO router)
predictionPosition-findByUser
predictionPosition-findConsolidated
predictionPosition-findOne
predictionPosition-sellLmsr      ← LMSR burn
```

**NO crear** mensajes `predictionOrder-*`, `predictionListing-*`,
`predictionRouter-*` (eran P2P).

### Prompt para IA — portar un service

```
Source MVP (usa Prisma):
[pegar service del MVP]

Target backend:
- NestJS 10 + TypeORM 0.3 + MySQL
- BalanceService vive en wallet-user-app, se llama vía
  firstValueFrom(this.apps.send('walletUser-debit', { ... }))
- LmsrService es @Injectable() en el mismo worker, se inyecta directo
- Transactions con this.dataSource.transaction(async (manager) => { ... })

Ejemplo de worker existente del backend:
[pegar 1 worker]

Reglas:
1. NO uses prisma.*. Todo es repos TypeORM o manager.* en tx.
2. Mantené EXACTAMENTE la lógica del MVP — la migración es 1:1.
3. Static → instance (this.method).
4. Errores con throw new Error(...).
5. Exponé públicos como @MessagePattern en un controller.
6. Para PredictionPosition.create:
   - Usar SELECT ... FOR UPDATE en Market + MarketOutcome del trade
   - Esto previene races concurrentes en el q-vector
7. Para PredictionPosition.sellLmsr:
   - Mismo locking
   - El check `if (position.isForSale)` ya NO existe — esa columna se borró

Output:
- positions.service.ts (con @Injectable)
- positions.controller.ts (con @MessagePattern)
- positions.module.ts (TypeOrmModule.forFeature + ClientsModule)
```

### Acceptance criteria

- [ ] 4 services compilan con `@Injectable()`
- [ ] Todos los `prisma.X` reemplazados
- [ ] Transacciones con `dataSource.transaction()`
- [ ] Cross-worker via Redis
- [ ] `@MessagePattern` handlers expuestos
- [ ] `SELECT FOR UPDATE` en hot paths
- [ ] `bun run build` compila

---

## 6. Fase 4 — API admin endpoints

### Archivos a portar

| MVP source | Target |
|---|---|
| `apps/api/src/admins/markets/*` | `apps/api/src/admins/predictionMarkets/*` |
| `apps/api/src/admins/users/*` | consolidar con `wallet-users` admin |
| `apps/api/src/admins/transactions/*` | `apps/api/src/admins/predictionTransactions/*` |
| `apps/api/src/admins/inactive-markets/*` | merge en `predictionMarkets` |

**NO portar** (eran P2P): `~~admins/router-logs~~`, `~~admins/purchases~~`.

### Cambios mecánicos

1. **DTOs**: zod → puro class-validator:
   ```ts
   export class UpdateMarketMetaDto {
     @ApiProperty({ required: false })
     @IsOptional() @IsString()
     question?: string;
   }
   ```
2. **Controller** decoradores reales:
   ```ts
   @ApiTags('Admin / Prediction Markets')
   @Controller('admin/predictionMarkets')
   @UseGuards(AuthAdminGuard)
   @ApiBearerAuth('JWT-auth')
   export class MarketsController {
     constructor(private readonly marketsService: MarketsService) {}
     @Patch(':id')
     updateMeta(@Param('id') id: string, @Body() body: UpdateMarketMetaDto) {
       return this.marketsService.updateMeta(id, body);
     }
   }
   ```
3. **Service**: Sabor A (proxy via `this.apps.send`) o Sabor B (TypeORM directo).
   `getStats` y `getReport` son Sabor B porque son agregaciones admin.
4. **Stats endpoint** debe incluir `effectiveB` y `Q` (LS-LMSR live).
5. **Module** con `TypeOrmModule.forFeature([...])` + `ClientsModule`.
6. **Registrar** en `apps/api/src/app.module.ts` y en el `SwaggerModule` admin.

### Prompt para IA

```
Source MVP:
[pegar route handler + controller stub + service + DTOs]

Target backend pattern:
[pegar 1 controller admin existente del backend]

Reglas:
1. DTOs: tirá zod, usá class-validator + @ApiProperty.
2. Controller: descomentá decoradores, agregá @UseGuards(AuthAdminGuard)
   y @ApiBearerAuth('JWT-auth').
3. Service: Sabor A → firstValueFrom(this.apps.send(...));
            Sabor B → repos TypeORM.
4. Module con TypeOrmModule.forFeature + ClientsModule.registerAsync.
5. Update apps/api/src/app.module.ts y main.ts (include en Swagger dashboard).
6. Para stats: incluir effectiveB calculado vía lmsrService.getEffectiveBN(qVector, params).
7. Para resolution report: usar fees.primaryBuy + fees.primarySell + fees.total
   computados desde positions + parse de transaction descriptions (ver MVP).

Output: 4 archivos (DTO, controller, service, module) + diff de app.module.ts y main.ts.
```

### Acceptance criteria

- [ ] Endpoints en `http://localhost/docsDashboard`
- [ ] Protegidos con `AuthAdminGuard`
- [ ] DTOs validan input
- [ ] Sabor A endpoints fallan si el worker está caído (esperado)
- [ ] Sabor B endpoints siguen funcionando sin el worker

---

## 7. Fase 5 — API público endpoints

### Archivos a portar

| MVP source | Target |
|---|---|
| `apps/api/src/markets/*` | `apps/api/src/predictionMarkets/*` |
| `apps/api/src/positions/*` | `apps/api/src/predictionPositions/*` |
| `apps/api/src/users/*` | consolidar con `wallet-users` cliente |

**NO portar**: `~~orders/~~`, `~~marketplace/~~`.

### Guards

- Reads públicos: `@UseGuards(OptionalAuthGuard)`
- Writes (`POST /predictionPositions`, `POST /predictionPositions/:id/sell-lmsr`):
  `@UseGuards(AuthGuard)` — wallet user obligatorio

### Endpoints públicos completos (sin P2P)

```
GET    /predictionMarkets                    public
GET    /predictionMarkets/:id                public
PATCH  /predictionMarkets/:id                admin actions
POST   /predictionMarkets/:id/resolve        admin
GET    /predictionMarkets/:id/resolve        public (report)
GET    /predictionMarkets/:id/comments       public
POST   /predictionMarkets/:id/comments       auth + holder
GET    /predictionMarkets/:id/snapshots      public
GET    /predictionMarkets/:id/activity       public
GET    /predictionMarkets/:id/state          public  ← devuelve effectiveB
GET    /predictionMarkets/:id/price-quote    public  ← LMSR mint sim
GET    /predictionMarkets/:id/sell-quote     public  ← LMSR burn sim

GET    /predictionPositions                  auth (filter by JWT.sub)
POST   /predictionPositions                  auth   ← LMSR mint
GET    /predictionPositions/:id              auth
POST   /predictionPositions/:id/sell-lmsr    auth   ← LMSR burn
```

### Acceptance criteria

- [ ] Endpoints en `http://localhost/docs`
- [ ] Guards correctos
- [ ] `/predictionPositions` filtra por `userId` del JWT (NUNCA del query)
- [ ] `/predictionMarkets/:id/comments` rechaza no-holders (403)
- [ ] `state` endpoint incluye `effectiveB`, `Q`, `alpha`, `bMin`

---

## 8. Fase 6 — Tests + Swagger + cleanup

### Tests unitarios

Patrón:

```ts
describe('PredictionMarketsService', () => {
  let service: PredictionMarketsService;
  let marketsRepo: jest.Mocked<Repository<PredictionMarket>>;
  let appsClient: jest.Mocked<ClientProxy>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PredictionMarketsService,
        { provide: getRepositoryToken(PredictionMarket), useValue: mockRepo() },
        { provide: 'APPS', useValue: { send: jest.fn() } },
      ],
    }).compile();
    // ...
  });
});
```

Cobertura objetivo: **80%**.

### Tests de paridad LMSR (CRÍTICOS)

Ver `TESTING_PLAYBOOK.md` sección 3. La math del LMSR debe dar EXACTAMENTE
los mismos números que el MVP validado, hasta el 6º decimal.

### Swagger

- [ ] `http://localhost/docs` muestra endpoints públicos nuevos
- [ ] `http://localhost/docsDashboard` muestra admin
- [ ] Cada endpoint con `@ApiTags`, descripción, ejemplos
- [ ] Bearer auth en protegidos

### Cleanup final

- [ ] `npm run lint` sin warnings
- [ ] `npm run test` verde
- [ ] `npm run test:e2e` verde
- [ ] `.env.example` actualizado

---

## 9. Fase 7 — Cache Redis

Ver `REAL_TIME_ARCHITECTURE.md` sección 3 para el diseño completo.

Resumen: read-through con invalidación explícita.

| Key | TTL | Invalidada por |
|---|---|---|
| `predMarket:meta:<id>` | 30s | updateMeta, activate, close, resolve |
| `predMarket:state:<id>` | 2s | toda mutación de q-vector |
| `predMarket:list:active` | 10s | activate, close, resolve |
| `predMarket:activity:<id>` | 3s | toda Position creada |
| `walletUser:balance:<id>` | 5s | toda credit/debit |

---

## 10. Fase 8 — WebSocket gateway

Ver `REAL_TIME_ARCHITECTURE.md` sección 4 para implementación completa.

**Eventos canónicos** (post-P2P, simplificados):

```
predMarket:<id>:trade           — buy o sell-lmsr completado
predMarket:<id>:priceUpdate     — q-vector y prices después del trade
predMarket:<id>:marketResolved  — outcome decidido, payouts iniciados
predMarket:<id>:paused          — primary paused
predMarket:<id>:closed          — status → CLOSED
walletUser:<id>:balanceUpdated  — balance cambió
```

**Eventos eliminados** (eran P2P): `~~listing:created~~`, `~~listing:sold~~`,
`~~order:filled~~`.

---

## 11. Fase 9 — Idempotency + BullMQ

Ver `REAL_TIME_ARCHITECTURE.md` secciones 5 y 6.

Endpoints que deben tener idempotency:

```
POST /predictionPositions                  ← @UseInterceptors(IdempotencyInterceptor)
POST /predictionPositions/:id/sell-lmsr    ← idem
```

Write-behind via BullMQ para:
- `PredictionLmsrSnapshot` (audit, fuera de tx crítica)
- `PredictionMarketHistory` (chart data)

---

## 12. Fase 10 — Data migration desde Supabase

### Tablas a migrar (orden topológico)

```
wallet_users
prediction_markets
prediction_market_outcomes
prediction_positions
prediction_transactions
prediction_market_histories
prediction_lmsr_snapshots
prediction_market_comments
```

**Tablas a NO migrar** (eran P2P):
`~~MarketplaceListing~~`, `~~Order~~`, `~~PositionTransfer~~`,
`~~MarketRouterAuditLog~~`.

### Script

```ts
// scripts/migrate-from-supabase.ts
const supabase = new PrismaClient({ url: SUPABASE_URL });
const mysql = createConnection(MYSQL_URL);
const idMap = new Map<string, number>();  // cuid → bigint

const markets = await supabase.market.findMany({ include: { outcomes: true } });
for (const m of markets) {
  const [{ insertId }] = await mysql.query(
    `INSERT INTO prediction_markets (question, b, alpha, b_min, ...) VALUES (?, ?, ?, ?, ...)`,
    [m.question, m.b, m.alpha, m.bMin, ...],
  );
  idMap.set(`market:${m.id}`, insertId);
  for (const o of m.outcomes) {
    const [{ insertId: oid }] = await mysql.query(
      `INSERT INTO prediction_market_outcomes (market_id, name, q_outstanding, ...) VALUES (?, ?, ?, ...)`,
      [insertId, o.name, o.qOutstanding, ...],
    );
    idMap.set(`outcome:${o.id}`, oid);
  }
}
```

### Verificación

- [ ] Conteos coinciden (excepto tablas dropped)
- [ ] Sum de `totalPool` por mercado coincide (±0.01)
- [ ] Sum de balances de usuarios coincide
- [ ] Spot check: 10 posiciones random idénticas

### Cutover

1. Anuncio (10-30 min ventana)
2. Pausar frontend
3. Correr migración
4. Verificar
5. Switch DNS/endpoints
6. Reabrir

---

## 13. Checklist final

### Backend

- [ ] Fases 1-6 mergeadas
- [ ] Tests verde en CI
- [ ] Swagger publicado
- [ ] Migration aplicada en staging
- [ ] Smoke tests staging OK

### Webapp (`win-field`)

- [ ] Feature `predictionMarket` agregado en `features/`
- [ ] Endpoints apuntan al backend
- [ ] WebSocket conectado (si fase 8 hecha)

### Dashboard (`dashboard-win`)

- [ ] Dominio `predictionMarkets` agregado
- [ ] `DateTimePicker` reusado o sustituido por `react-day-picker`
- [ ] Endpoints apuntan al backend
- [ ] Sidebar actualizado

### Datos

- [ ] Dump Supabase respaldado
- [ ] Migración corrió en MySQL prod
- [ ] Spot checks OK
- [ ] Rollback testeado

### Cutover

- [ ] Comunicación al equipo
- [ ] Ventana de mantenimiento programada
- [ ] Monitoreo activo 24h post-cutover

---

## 14. Uso de IA — workflow

### Recomendado

1. **Una fase por sesión**. No mezclar.
2. **Cargar contexto**:
   - `MIGRATION_PLAN.md` (este doc)
   - `README.md` de design-docs
   - `REPO_STRUCTURE_backend.md`
   - Source del MVP que vas a portar
   - 1 ejemplo del backend del mismo tipo
3. **Prompt pre-fabricado** de la fase.
4. **Después de cada generación**, revisar manualmente:
   - ¿Cumple las reglas?
   - ¿Compila? (`bun run build`)
   - ¿Pasa tests?
5. **Iterar hasta verde**. NO mergear sin verde.

### Anti-patrones

- ❌ "Migrame todo el dominio" en un solo prompt
- ❌ Aceptar código sin revisar respecto al MVP (la IA puede "optimizar"
  y romper invariantes del LMSR)
- ❌ Saltar fases
- ❌ Aplicar cache (fase 7) antes de tests verde (fase 6)

### Plantilla genérica

```
Estoy portando código de un MVP Next.js+Prisma a un backend NestJS+TypeORM.

CONTEXTO:
- MVP repo: mvp_token_call
- Backend repo: api.win.investments
- Stack del backend: NestJS 10 + TypeORM 0.3 + MySQL + Redis + BullMQ
- Modelo: LS-LMSR multi-outcome puro, sin P2P
- Convenciones del backend: [pegar sección de REPO_STRUCTURE_backend.md]

TAREA:
[Describir tarea]

SOURCE (MVP):
[pegar]

REFERENCIA (1 archivo similar ya migrado):
[pegar]

REGLAS:
1. NO cambies lógica de negocio. Migración 1:1.
2. Convenciones EXACTAS del archivo de referencia.
3. Tests + Swagger anotados.
4. Errores de validación con class-validator, de negocio con throw new Error.

OUTPUT:
- Archivos generados
- Diff de archivos a modificar
- Lista de checks manuales antes de mergear
```

---

## 15. Referencias

- [README.md](./README.md) — índice y modelo final
- [REAL_TIME_ARCHITECTURE.md](./REAL_TIME_ARCHITECTURE.md) — mejoras 7-9
- [TESTING_PLAYBOOK.md](./TESTING_PLAYBOOK.md) — testing por fase

---

_Última actualización: post-cleanup LS-LMSR-only + remoción P2P._
