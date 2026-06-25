# CVO — DoraHacks BUIDL Submission Draft

> Casper Agentic Buildathon 2026. Copy-paste ready.

---

## Project Name
Casper Verifiable Yield Oracle (CVO)

## Tagline / One-liner
Autonomous AI yield & risk oracle agents that publish verifiable, auditable assessments on the Casper Network.

## Category / Track
Agentic + DeFi (trust layer for the agent economy)

---

## Short Description (≈ tweet length)
CVO is an autonomous AI oracle for DeFi on Casper. Off-chain agents perceive live pool metrics, score yield/risk with an LLM, then sign and submit the result on-chain — building verifiable, readable reputation with every attestation. No human in the loop.

---

## Full Description

**The problem.** AI agents are starting to drive DeFi decisions (yield routing, risk scoring), but their output is a black box. You can't verify what an off-chain model claimed, when it claimed it, or whether it has a track record. There's no trust layer.

**CVO's answer.** Two parts working together:

1. **On-chain attestation registry** — an Odra smart contract on Casper where whitelisted AI agents publish yield (APY) and risk scores for DeFi pools. Every `publish` is a real, state-changing Casper transaction that also bumps the agent's on-chain **reputation**. Anyone — dApps, other agents, a hackathon jury — can read the latest score for any pool and any agent's reputation. The AI's output becomes verifiable and auditable.

2. **Autonomous off-chain agent (Node.js)** — on a loop, it pulls live DeFi pool metrics, scores them with an LLM (`apy_bps`, `risk_bps`, `confidence_bps` + rationale), then signs and submits the result to the contract. No human in the loop: it perceives, decides, and acts.

**Why this fits Casper's thesis ("trust layer for the agent economy"):**
- **Agentic** — the agent perceives (pool data), decides (LLM scoring), and acts (submits on-chain tx) autonomously.
- **Verifiable** — outputs + reputation live on-chain, readable by anyone, for free.
- **DeFi-relevant** — yield routing & risk scoring is core DeFi infrastructure.

---

## Live Proof (on Casper Testnet `casper-test`)

CVO is deployed and producing real on-chain transactions. Full proof in `DEPLOYMENT.md`.

- **Contract package:** https://testnet.cspr.live/contract-package/c26ca260dde2e2e5ffcde635807c3420350c0b7ef5fac527691b9674606337a4
- **Install tx:** https://testnet.cspr.live/transaction/004a2323087675671da0cd296a7a55a076e94b1cf7aa5c8e001839d976f445d3
- **register_agent tx:** https://testnet.cspr.live/transaction/f21b873574f01b9bf8b917c331e3d10ed92059b5b2a0dcef157285355212128e
- **publish attestation tx:** https://testnet.cspr.live/transaction/06c19f422b5bb78bbf37c9ae6e52197017c1f4ff824e15d8737edce60855d7f2
- **Live agent attestations:** `eb51e38a…`, `aaf63adc…`, `a10b063a…` (CSPR-USDC, CSPR-ETH, USDC-DAI — all SUCCESS)

---

## Links

- **GitHub repo:** https://github.com/0xKii/casper-yield-oracle
- **Live dashboard (GitHub Pages):** https://0xkii.github.io/casper-yield-oracle/
- **Demo video:** in repo at `docs/video/cvo_demo.mp4`
- **Deployment proof:** https://github.com/0xKii/casper-yield-oracle/blob/master/DEPLOYMENT.md

---

## Tech Stack
- **Smart contract:** Rust + Odra framework, compiled to Casper wasm
- **Chain:** Casper Network (`casper-test` testnet)
- **Agent:** Node.js (perceive → LLM score → sign → submit loop)
- **Frontend:** zero-dependency HTML/JS dashboard reading the on-chain attestation feed
- **Tooling:** casper-client v5.0.1, cargo-odra

---

## Contract API (summary)

State-changing (on-chain tx):
- `init()` — deployer sets owner
- `register_agent(agent, label)` — owner whitelists an oracle agent
- `revoke_agent(agent)` — owner removes an agent
- `publish(pool_id, apy_bps, risk_bps, confidence_bps, rationale)` — agent publishes attestation; bumps reputation

Read-only views (free): `is_agent`, `reputation_of`, `latest_attestation`, `pool_sequence`, `total`, `pool_count`, `pool_at`. All basis-point fields use `0..=10000` (e.g. `1250` = 12.50%).

---

## What's next (long-term)
- Multi-agent consensus: aggregate attestations from several agents, weight by on-chain reputation
- Slashing / dispute mechanism for bad attestations
- Mainnet deployment + public read API for dApps to consume scores
- Expand pool data sources beyond the current metric set
