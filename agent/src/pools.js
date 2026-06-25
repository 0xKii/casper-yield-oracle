// Pool metrics provider.
//
// In production this would hit a live DeFi data API (CSPR.trade, Meteora, etc.).
// For the buildathon demo it ships with a deterministic mock source so the
// agent loop is fully runnable without external keys, and a pluggable
// `fetchLivePools` hook for real integrations.

const DEFAULT_POOLS = [
  { id: "CSPR-USDC", label: "CSPR/USDC core" },
  { id: "CSPR-ETH", label: "CSPR/ETH volatile" },
  { id: "USDC-DAI", label: "USDC/DAI stable" },
];

// Generate plausible, slightly noisy metrics for a pool. Deterministic-ish so
// demos are reproducible but still move between cycles.
function syntheticMetrics(poolId) {
  const seed = [...poolId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const t = Date.now() / 1000;
  const wobble = (n) => Math.abs(Math.sin(seed + t / 600 + n));

  const tvlUsd = Math.round(50_000 + wobble(1) * 950_000);
  const volume24hUsd = Math.round(tvlUsd * (0.1 + wobble(2) * 1.5));
  const feeApyPct = +(2 + wobble(3) * 40).toFixed(2);
  const priceVolatilityPct = +(wobble(4) * 60).toFixed(2);
  const depthScore = +(wobble(5)).toFixed(3); // 0..1, higher = deeper

  return {
    poolId,
    tvlUsd,
    volume24hUsd,
    feeApyPct,
    priceVolatilityPct,
    depthScore,
    observedAt: new Date().toISOString(),
  };
}

export function getPools() {
  const env = process.env.POOLS?.trim();
  if (!env) return DEFAULT_POOLS;
  return env.split(",").map((entry) => {
    const [id, label] = entry.split(":");
    return { id: id.trim(), label: (label || id).trim() };
  });
}

// Public API: returns metrics for all configured pools.
export async function fetchPoolMetrics() {
  const pools = getPools();
  // Hook point: replace with real API calls when available.
  return pools.map((p) => ({ ...p, metrics: syntheticMetrics(p.id) }));
}
