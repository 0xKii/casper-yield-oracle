# CVO Autonomous Oracle Agent

The off-chain half of the Casper Verifiable Yield Oracle. Runs an autonomous
loop:

1. **Perceive** — fetch DeFi pool metrics (`src/pools.js`).
2. **Decide** — score yield & risk with an LLM, with a deterministic heuristic
   fallback (`src/scorer.js`).
3. **Act** — submit a `publish(...)` transaction to the on-chain `YieldOracle`
   contract via `casper-client` (`src/publisher.js`).

The agent runs fully offline in **dry-run** mode (prints the deploy it would
send) when no contract hash / key / `casper-client` is present, so the loop is
always demonstrable.

## Setup

```bash
npm install
cp .env.sample .env
# edit .env: node URL, secret key path, contract hash, LLM key
```

## Run

```bash
npm start                 # continuous loop (LOOP_INTERVAL_SECONDS)
npm run once              # single cycle then exit
npm run score-only        # score + print, never touches chain
node src/index.js --once --heuristic   # one cycle, skip LLM
```

## Flags

| Flag | Effect |
|---|---|
| `--once` | Run one cycle and exit |
| `--score-only` | Score + log only, never publish |
| `--heuristic` | Skip the LLM, use the deterministic scorer |

## Output scale

All scores are basis points: `1250` = 12.50%. `risk_bps` and `confidence_bps`
are `0..=10000`. These match the contract's validation bounds.

## Swapping in real pool data

`src/pools.js` ships a synthetic metrics source. Replace `fetchPoolMetrics`
with calls to a live DeFi data API (e.g. CSPR.trade) — keep the same return
shape (`{ id, label, metrics }`).
