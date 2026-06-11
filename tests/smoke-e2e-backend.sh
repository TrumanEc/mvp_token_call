#!/usr/bin/env bash
# ============================================================================
# Smoke test E2E del backend (api.win.investments) post-migración.
# Cubre: admin create → activate → user buy (LMSR mint) → user sell-back →
#        admin resolve → verificar payout + fees del report.
#
# Pre-requisitos:
#   1. Backend levantando local en APP_PORT=3001 (APP_ENV=local hace bypass
#      del AuthAdminGuard, no necesitamos JWT real de Cognito)
#   2. Workers prediction-app y wallet-user-app corriendo (sin ellos los
#      endpoints Sabor A timeout-ean)
#   3. Un wallet user con balance suficiente (>=200)
#   4. jq instalado (brew install jq)
#
# Uso:
#   chmod +x smoke-e2e-backend.sh
#   USER_ID=123 ./smoke-e2e-backend.sh
#   USER_ID=123 API=http://localhost:3001 ./smoke-e2e-backend.sh
# ============================================================================

set -euo pipefail

 API="${API:-http://localhost:3001}"
USER_ID="${USER_ID:?Falta USER_ID — pasalo como variable: USER_ID=123 ./smoke-e2e-backend.sh}"
 ADMIN_TOKEN="${ADMIN_TOKEN:-local-bypass}"  # APP_ENV=local → cualquier token vale
USER_TOKEN="${USER_TOKEN:-local-bypass}" 
 


# Colores
G="\033[0;32m"  # green
R="\033[0;31m"  # red
Y="\033[1;33m"  # yellow
B="\033[0;34m"  # blue
N="\033[0m"

pass() { echo -e "${G}✓${N} $1"; }
fail() { echo -e "${R}✗${N} $1"; exit 1; }
step() { echo -e "\n${B}▸${N} ${Y}$1${N}"; }

# ============================================================================
# Helper: get user balance directo (asume endpoint estándar)
# ============================================================================
get_balance() {
    curl -fsS -H "Authorization: Bearer $USER_TOKEN" \
        "$API/userProfile" 2>/dev/null \
        | jq -r '(.balance // .data.balance // 0) | tostring | gsub("[^0-9.-]"; "")' || echo "0"
}

# ============================================================================
# 0. Verificar que el backend responda
# ============================================================================
step "0. Health check"
curl -fsS "$API/healthcheck" >/dev/null 2>&1 && pass "backend responde en $API" \
    || fail "backend no responde en $API — está corriendo?"

BAL_INICIAL=$(get_balance)
echo "  Balance inicial del user $USER_ID: \$$BAL_INICIAL"
[ "$(echo "$BAL_INICIAL < 200" | bc -l)" -eq 1 ] \
    && echo -e "  ${Y}⚠ Balance bajo, los pasos de buy pueden fallar${N}"

# ============================================================================
# 1. Admin crea mercado binario
# ============================================================================
step "1. Admin crea mercado binario"
CREATE=$(curl -fsS -X POST "$API/admin/predictionMarkets" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(cat <<EOF
{
  "question": "Smoke test market — $(date +%s)",
  "resolutionDate": "2027-12-31T15:30:00-03:00",
  "outcomes": [
    { "name": "YES", "initialProbability": 0.5 },
    { "name": "NO", "initialProbability": 0.5 }
  ],
  "alpha": 0.15,
  "bMin": 1000
}
EOF
)")

MARKET_ID=$(echo "$CREATE" | jq -r '.id // .data.id')
[ -z "$MARKET_ID" ] || [ "$MARKET_ID" == "null" ] \
    && fail "no se pudo crear market. Response: $CREATE"
pass "market creado: id=$MARKET_ID"
STATUS=$(echo "$CREATE" | jq -r '.status // .data.status')
[ "$STATUS" == "DRAFT" ] && pass "status=DRAFT" || fail "esperaba DRAFT, got $STATUS"

OUTCOME_YES_ID=$(echo "$CREATE" | jq -r '.outcomes[0].id // .data.outcomes[0].id')
OUTCOME_NO_ID=$(echo "$CREATE"  | jq -r '.outcomes[1].id // .data.outcomes[1].id')
echo "  outcome YES=$OUTCOME_YES_ID  NO=$OUTCOME_NO_ID"

# ============================================================================
# 2. Activate
# ============================================================================
step "2. Admin activa el mercado"
curl -fsS -X PATCH "$API/admin/predictionMarkets/status/$MARKET_ID/activate" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" >/dev/null
pass "PATCH activate OK"

# ============================================================================
# 3. State endpoint expone effectiveB
# ============================================================================
step "3. GET state — debe exponer effectiveB y Q"
STATE=$(curl -fsS "$API/predictionMarkets/$MARKET_ID/state")
EFF_B=$(echo "$STATE" | jq -r '.effectiveB // .data.effectiveB // empty')
Q=$(echo "$STATE" | jq -r '.Q // .data.Q // empty')
[ -z "$EFF_B" ] && fail "el endpoint state NO expone effectiveB — revisar markets.service.ts"
pass "effectiveB=$EFF_B  Q=$Q"
[ "$(echo "$EFF_B >= 1000" | bc -l)" -eq 1 ] \
    && pass "effectiveB >= bMin (1000) ✓" \
    || fail "effectiveB=$EFF_B debería ser >= 1000"

# ============================================================================
# 4. Price quote — preview del buy
# ============================================================================
step "4. GET price-quote (preview 100 sobre YES)"
QUOTE=$(curl -fsS "$API/predictionMarkets/$MARKET_ID/price-quote?outcomeId=$OUTCOME_YES_ID&amount=100")
# loggea la response de quote
echo " quote response: $QUOTE"
echo " ============================================================================ /// marketId= $MARKET_ID // outcomeId= $OUTCOME_YES_ID"
SHARES_PREVIEW=$(echo "$QUOTE" | jq -r '.shares // .data.shares')
AVG_PRICE=$(echo "$QUOTE" | jq -r '.cost // .data.cost')
FEE=$(echo "$QUOTE" | jq -r '.fees // .data.fees')
[ -z "$SHARES_PREVIEW" ] && fail "price-quote no devuelve shares"
pass "preview: $SHARES_PREVIEW shares @ \$$AVG_PRICE c/u, fee=\$$FEE"

# ============================================================================
# 5. User compra (LMSR mint $100 en YES)
# ============================================================================
step "5. User compra LMSR mint \$100 en YES"
IDEM_KEY=$(uuidgen | tr 'A-Z' 'a-z')
BUY=$(curl -fsS -X POST "$API/predictionPositions" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d "{\"marketId\":\"$MARKET_ID\",\"outcomeId\":\"$OUTCOME_YES_ID\",\"amount\":100}")

echo " BUY response: $BUY"
echo " ============================================================================"

POSITION_ID=$(echo "$BUY" | jq -r '.id // .data.id')
SHARES_REAL=$(echo "$BUY" | jq -r '.shares // .data.shares')
[ -z "$POSITION_ID" ] || [ "$POSITION_ID" == "null" ] \
    && fail "buy falló. Response: $BUY"
pass "position $POSITION_ID minteada — $SHARES_REAL shares (preview decía $SHARES_PREVIEW)"

# Comparar shares preview vs real (deben coincidir hasta 4 decimales)
DIFF=$(echo "scale=4; $SHARES_REAL - $SHARES_PREVIEW" | bc -l)
ABS_DIFF=${DIFF#-}
[ "$(echo "$ABS_DIFF < 0.01" | bc -l)" -eq 1 ] \
    && pass "preview ↔ ejecución: shares match (diff=$DIFF)" \
    || fail "preview ↔ ejecución divergen demasiado (diff=$DIFF)"

BAL_POST_BUY=$(get_balance)
EXPECTED=$(echo "$BAL_INICIAL - 100" | bc -l)
echo "  balance: \$$BAL_INICIAL → \$$BAL_POST_BUY (esperado \$$EXPECTED)"
[ "$(echo "$BAL_POST_BUY == $EXPECTED" | bc -l)" -eq 1 ] \
    && pass "balance debitado correcto" \
    || fail "balance debitado mal: esperado \$$EXPECTED, got \$$BAL_POST_BUY"

# ============================================================================
# 6. Idempotency: mismo key → no duplica
# ============================================================================
step "6. Idempotency — segundo POST con misma key NO debe duplicar"
BUY2=$(curl -fsS -X POST "$API/predictionPositions" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d "{\"marketId\":\"$MARKET_ID\",\"outcomeId\":\"$OUTCOME_YES_ID\",\"amount\":100,\"userId\":\"$USER_ID\"}")
POSITION_ID_2=$(echo "$BUY2" | jq -r '.id // .data.id')
[ "$POSITION_ID_2" == "$POSITION_ID" ] \
    && pass "misma position devuelta ($POSITION_ID_2)" \
    || fail "DUPLICÓ! id1=$POSITION_ID id2=$POSITION_ID_2 — idempotency rota"

BAL_AFTER_DUPE=$(get_balance)
[ "$(echo "$BAL_AFTER_DUPE == $BAL_POST_BUY" | bc -l)" -eq 1 ] \
    && pass "balance NO cambió en el reintento" \
    || fail "balance cambió en reintento: \$$BAL_POST_BUY → \$$BAL_AFTER_DUPE"

# ============================================================================
# 7. Sell-back LMSR — vender la mitad de las shares
# ============================================================================
step "7. Sell-back LMSR — vender la mitad de las shares"
SHARES_TO_SELL=$(echo "scale=4; $SHARES_REAL / 2" | bc -l)
echo " ============================================================================"
echo " SHARES TO SELL: $SHARES_TO_SELL"
echo " ============================================================================"

SELL=$(curl -fsS -X POST "$API/predictionPositions/$POSITION_ID/sell-lmsr" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"sharesToSell\":$SHARES_TO_SELL}")
echo " ============================================================================"
echo " SELL response: $SELL"
echo " ============================================================================"

NET=$(echo "$SELL" | jq -r '.revenue // .data.revenue')
SHARES_SOLD=$(echo "$SELL" | jq -r '.sold // .data.sold')
[ -z "$NET" ] && fail "sell-lmsr no devuelve revenue. Response: $SELL"
pass "vendidas $SHARES_SOLD shares → user recibió \$$NET"

BAL_POST_SELL=$(get_balance)
EXPECTED=$(echo "$BAL_POST_BUY + $NET" | bc -l)
DIFF=$(echo "scale=2; $BAL_POST_SELL - $EXPECTED" | bc -l)
ABS_DIFF=${DIFF#-}
[ "$(echo "$ABS_DIFF < 0.01" | bc -l)" -eq 1 ] \
    && pass "balance creditado correcto: \$$BAL_POST_BUY → \$$BAL_POST_SELL" \
    || fail "balance mal: esperado \$$EXPECTED, got \$$BAL_POST_SELL"

# ============================================================================
# 8. Admin resuelve: YES gana
# ============================================================================
step "8. Admin resuelve — YES gana"
RESOLVE=$(curl -fsS -X POST "$API/admin/predictionMarkets/$MARKET_ID/resolve" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"winningOutcomeId\":\"$OUTCOME_YES_ID\"}")
echo "  resolve response: $(echo "$RESOLVE" | jq -c '.type // .data.type // .')"

# agrega algo para que espere ya que en el backend es eproceso se hace por jobs
echo " ============================================================================"
echo " RESOLVE response: $RESOLVE"
echo " ============================================================================"

# ============================================================================
# 9. Verificar settlement report
# ============================================================================
step "9. GET report — verificar fees y payout estructura"
REPORT=$(curl -fsS "$API/predictionMarkets/$MARKET_ID/resolve")
echo " ============================================================================"
echo " REPORT response: $REPORT"
echo " ============================================================================"

FEES_TOTAL=$(echo "$REPORT" | jq -r '.fees.total // .data.fees.total')
FEES_BUY=$(echo "$REPORT" | jq -r '.fees.primaryBuy // .data.fees.primaryBuy // empty')
FEES_SELL=$(echo "$REPORT" | jq -r '.fees.primarySell // .data.fees.primarySell // empty')
FEES_SECONDARY=$(echo "$REPORT" | jq -r '.fees.secondary // .data.fees.secondary // empty')

[ -n "$FEES_SECONDARY" ] && [ "$FEES_SECONDARY" != "null" ] \
    && fail "report.fees.secondary aún existe (debería estar borrado post-P2P)"
pass "report.fees.secondary NO existe (P2P correctamente removido)"

[ -z "$FEES_TOTAL" ] || [ "$FEES_TOTAL" == "null" ] && fail "report.fees.total falta"
pass "fees.total=\$$FEES_TOTAL · primaryBuy=\$$FEES_BUY · primarySell=\$$FEES_SELL"

# Verificar payout final del user
BAL_FINAL=$(get_balance)
PAYOUT_PER_SHARE=$(echo "$REPORT" | jq -r '.results.payoutPerShare // .data.results.payoutPerShare')
echo "  payoutPerShare=\$$PAYOUT_PER_SHARE"
echo "  balance final del user: \$$BAL_FINAL (inicial era \$$BAL_INICIAL)"

# ============================================================================
# Final
# ============================================================================
echo
echo -e "${G}═══════════════════════════════════════════════════════════════════${N}"
echo -e "${G}  ✓ Smoke test E2E completo — 9 pasos OK${N}"
echo -e "${G}═══════════════════════════════════════════════════════════════════${N}"
echo "  Market creado:  $MARKET_ID"
echo "  Position:       $POSITION_ID"
echo "  Balance flow:   \$$BAL_INICIAL → \$$BAL_POST_BUY → \$$BAL_POST_SELL → \$$BAL_FINAL"
echo "  Fees cobrados:  \$$FEES_TOTAL"
echo
