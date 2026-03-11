/**
 * market-visual.ts
 * Generates a deterministic visual identity (gradient + emoji) for a market
 * based on its ID and question text.
 *
 * When the Market model gets an `imageUrl` field, just check for it first
 * and fall back to this if it's not set.
 */

// ── Keyword → emoji mapping ───────────────────────────────────────────────────
const KEYWORD_EMOJIS: [RegExp, string][] = [
  [/\bbtc|bitcoin\b/i, "₿"],
  [/\beth|ethereum\b/i, "Ξ"],
  [/\bcrypto|token|coin|defi\b/i, "🪙"],
  [/\belección|election|vot|presidente|president\b/i, "🗳️"],
  [/\briver|boca|fútbol|futbol|soccer|football|mundial|cup\b/i, "⚽"],
  [/\bbasket|nba\b/i, "🏀"],
  [/\btenis|tennis\b/i, "🎾"],
  [/\bformula|f1|racing\b/i, "🏎️"],
  [/\bwar|guerra|conflict\b/i, "⚔️"],
  [/\bai|inteligencia artificial|gpt|llm\b/i, "🤖"],
  [/\bbolsa|stock|sp500|nasdaq|dow\b/i, "📈"],
  [/\bclima|weather|temperatura\b/i, "🌦️"],
  [/\btest|prueba|simulation|simulaci/i, "🧪"],
  [/\bgana|win|won|pierde|lose\b/i, "🏆"],
  [/\bmusica|music|taylor|concierto\b/i, "🎵"],
  [/\bpeli|movie|film|oscar\b/i, "🎬"],
];

// ── Gradient palettes (deterministic by market ID hash) ───────────────────────
const GRADIENTS = [
  ["#1a1a2e", "#16213e", "#0f3460"],   // deep blue
  ["#0d1b2a", "#1b263b", "#415a77"],   // steel blue
  ["#1a0a2e", "#2d1b69", "#11998e"],   // purple-teal
  ["#0a0a0a", "#1a1a1a", "#64c883"],   // WIN green
  ["#1a0000", "#3d0000", "#cc3333"],   // deep red
  ["#0a1628", "#1a2e4a", "#e67e22"],   // dark orange
  ["#0d0d1a", "#1a1a3e", "#9b59b6"],   // violet
  ["#0a1a0a", "#1a2e1a", "#2ecc71"],   // forest green
  ["#1a1200", "#3d2e00", "#f39c12"],   // amber
  ["#0d1a1a", "#1B4F72", "#1ABC9C"],   // teal
];

// Simple FNV-like hash for string → number
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

export interface MarketVisual {
  /** CSS gradient string, e.g. "linear-gradient(135deg, #1a1a2e, #0f3460)" */
  gradient: string;
  /** from → to colors for inline style */
  from: string;
  to: string;
  mid: string;
  /** emoji representing the market theme */
  emoji: string;
}

export function getMarketVisual(marketId: string, question: string = ""): MarketVisual {
  const hash = hashString(marketId);
  const palette = GRADIENTS[hash % GRADIENTS.length];

  // Pick emoji by keyword or fall back to hash-based generic set
  const FALLBACKS = ["🎯", "📊", "💡", "🔮", "⚡", "🌐", "💎", "🎲", "🚀", "🌊"];
  let emoji = FALLBACKS[hash % FALLBACKS.length];

  for (const [regex, em] of KEYWORD_EMOJIS) {
    if (regex.test(question)) {
      emoji = em;
      break;
    }
  }

  return {
    gradient: `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 50%, ${palette[2]} 100%)`,
    from: palette[0],
    mid: palette[1],
    to: palette[2],
    emoji,
  };
}
