// Autonomous CVO oracle agent — main loop.
//
// Cycle: perceive (fetch pool metrics) -> decide (LLM score) -> act (publish
// on-chain attestation). Runs once with --once, or loops on an interval.

import "dotenv/config";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fetchPoolMetrics } from "./pools.js";
import { scorePool } from "./scorer.js";
import { publishAttestation } from "./publisher.js";

const args = new Set(process.argv.slice(2));
const ONCE = args.has("--once");
const SCORE_ONLY = args.has("--score-only");
const PREFER_HEURISTIC = args.has("--heuristic");

const cfg = {
  nodeUrl: process.env.CASPER_NODE_URL || "https://node.testnet.casper.network",
  chainName: process.env.CASPER_CHAIN_NAME || "casper-test",
  secretKeyPath: process.env.CASPER_SECRET_KEY_PATH,
  packageHash: process.env.CVO_PACKAGE_HASH,
  gas: process.env.CVO_PUBLISH_GAS || "5000000000",
  gasPriceTolerance: process.env.CASPER_GAS_PRICE_TOLERANCE || "1",
};

// Where the agent records every on-chain publish so the web dashboard can
// render a verifiable, transaction-linked feed.
const LEDGER_PATH = process.env.CVO_LEDGER_PATH || "../frontend/ledger.json";
const EXPLORER = "https://testnet.cspr.live/transaction/";

function appendToLedger(entry) {
  try {
    mkdirSync(dirname(LEDGER_PATH), { recursive: true });
    let data = { contract: cfg.packageHash || null, attestations: [] };
    if (existsSync(LEDGER_PATH)) {
      data = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
    }
    data.contract = cfg.packageHash || data.contract;
    data.updatedAt = new Date().toISOString();
    data.attestations.unshift(entry);
    data.attestations = data.attestations.slice(0, 200);
    writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    log("ledger write failed:", e.message);
  }
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function runCycle() {
  log("cycle start");
  const pools = await fetchPoolMetrics();
  for (const pool of pools) {
    const score = await scorePool(pool.metrics, { preferHeuristic: PREFER_HEURISTIC });
    const att = {
      poolId: pool.id,
      apy_bps: score.apy_bps,
      risk_bps: score.risk_bps,
      confidence_bps: score.confidence_bps,
      rationale: score.rationale,
    };
    log(
      `scored ${pool.id} -> apy=${(att.apy_bps / 100).toFixed(2)}% ` +
        `risk=${(att.risk_bps / 100).toFixed(1)}% conf=${(att.confidence_bps / 100).toFixed(0)}% ` +
        `[${score.source}]`
    );

    if (SCORE_ONLY) continue;

    const res = publishAttestation(att, cfg);
    if (res.dryRun) {
      log(`  DRY-RUN (${res.reason}) would publish:`, JSON.stringify(res.wouldSend.args));
    } else if (res.ok) {
      log(`  published on-chain, tx=${res.deployHash || "(see raw)"}`);
      appendToLedger({
        ...att,
        source: score.source,
        tx: res.deployHash || null,
        explorer: res.deployHash ? EXPLORER + res.deployHash : null,
        publishedAt: new Date().toISOString(),
      });
    } else {
      log(`  publish FAILED: ${res.error}`);
    }
  }
  log("cycle done");
}

async function main() {
  await runCycle();
  if (ONCE || SCORE_ONLY) return;

  const intervalMs = (Number(process.env.LOOP_INTERVAL_SECONDS) || 1800) * 1000;
  log(`looping every ${intervalMs / 1000}s`);
  setInterval(() => {
    runCycle().catch((e) => log("cycle error:", e.message));
  }, intervalMs);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
