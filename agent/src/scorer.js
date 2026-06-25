// LLM-based yield/risk scorer.
//
// Takes raw pool metrics and asks an LLM to produce a structured assessment:
//   { apy_bps, risk_bps, confidence_bps, rationale }
//
// Falls back to a deterministic heuristic scorer if no LLM is configured or the
// call fails — so the agent never stalls.

const SYSTEM_PROMPT = `You are a DeFi yield/risk oracle. Given pool metrics, output a STRICT JSON object:
{"apy_bps": <int 0-100000>, "risk_bps": <int 0-10000>, "confidence_bps": <int 0-10000>, "rationale": "<max 60 chars>"}
- apy_bps: expected net APY in basis points (1250 = 12.5%).
- risk_bps: 0 safe .. 10000 max risk. Weigh volatility, thin depth, low TVL.
- confidence_bps: your confidence 0..10000.
- rationale: short, no JSON, no newlines.
Output ONLY the JSON object, nothing else.`;

function heuristicScore(m) {
  // APY straight from fee APY, clamp.
  const apy_bps = Math.min(100000, Math.round(m.feeApyPct * 100));
  // Risk: volatility dominates, thin depth + low TVL add risk.
  const volRisk = Math.min(1, m.priceVolatilityPct / 60);
  const depthRisk = 1 - m.depthScore;
  const tvlRisk = m.tvlUsd < 100_000 ? 0.4 : m.tvlUsd < 300_000 ? 0.2 : 0;
  const risk = Math.min(1, 0.55 * volRisk + 0.3 * depthRisk + tvlRisk);
  const risk_bps = Math.round(risk * 10000);
  // Confidence: deeper + higher TVL -> more confident.
  const conf = Math.max(0.3, Math.min(1, 0.5 * m.depthScore + 0.5 * Math.min(1, m.tvlUsd / 500_000)));
  const confidence_bps = Math.round(conf * 10000);
  const rationale = `heuristic vol${m.priceVolatilityPct}% depth${m.depthScore}`.slice(0, 60);
  return { apy_bps, risk_bps, confidence_bps, rationale };
}

function clampScore(s) {
  const i = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  return {
    apy_bps: i(s.apy_bps, 100000),
    risk_bps: i(s.risk_bps, 10000),
    confidence_bps: i(s.confidence_bps, 10000),
    rationale: String(s.rationale || "").replace(/\s+/g, " ").slice(0, 60),
  };
}

async function llmScore(metrics) {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "kr/claude-sonnet-4.6";
  if (!baseUrl) throw new Error("no LLM_BASE_URL");

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(metrics) },
      ],
      temperature: 0.2,
      max_tokens: 200,
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM returned no JSON");
  return clampScore(JSON.parse(match[0]));
}

// Public API: score a single pool's metrics. LLM first, heuristic fallback.
export async function scorePool(metrics, { preferHeuristic = false } = {}) {
  if (preferHeuristic) return { ...heuristicScore(metrics), source: "heuristic" };
  try {
    const s = await llmScore(metrics);
    return { ...s, source: "llm" };
  } catch (err) {
    const s = heuristicScore(metrics);
    return { ...s, source: `heuristic (llm failed: ${err.message})` };
  }
}
