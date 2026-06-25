# CVO — Architecture & Demo Guide

## 1. Problem

DeFi yield/risk assessments are produced off-chain by opaque processes. There
is no portable, verifiable record of *which* agent said *what* about a pool, or
whether that agent has historically been accurate. As autonomous agents become
economic actors, they need an on-chain trust layer — exactly Casper's thesis.

## 2. Solution

CVO is an on-chain **attestation registry** plus an **autonomous agent**:

- Agents are whitelisted by the contract owner.
- Each agent publishes `(apy_bps, risk_bps, confidence_bps, rationale)` per pool
  as a real Casper transaction.
- Every publish bumps the agent's **reputation** counter on-chain.
- Anyone can read the latest attestation for a pool and any agent's reputation.

The off-chain agent autonomously perceives pool metrics, scores them with an
LLM, and submits the result — closing the agentic loop.

## 3. Components

| Layer | Tech | File(s) |
|---|---|---|
| Smart contract | Rust + Odra 2.8 | `src/yield_oracle.rs` |
| Wasm build entry | Odra | `bin/build_contract.rs` |
| Schema entry | Odra | `bin/build_schema.rs` |
| CLI (deploy/publish) | odra-cli | `bin/cli.rs` |
| Testnet deploy script | Odra Livenet | `bin/cvo_on_livenet.rs` |
| Autonomous agent | Node.js | `agent/src/*.js` |

## 4. On-chain data model

```
Attestation {
  agent: Address,
  pool_id: String,
  apy_bps: u32,        // 1250 = 12.50%
  risk_bps: u32,       // 0..10000
  confidence_bps: u32, // 0..10000
  rationale: String,
  seq: u64,            // per-pool sequence
}
```

Storage:
- `owner: Var<Address>`
- `agents: Mapping<Address, bool>`
- `reputation: Mapping<Address, u64>`
- `latest: Mapping<String, Attestation>`
- `pool_seq: Mapping<String, u64>`
- `pools: List<String>`
- `total_attestations: Var<u64>`

Events: `AgentRegistered`, `AttestationPublished`.

## 5. Agentic loop

```
every LOOP_INTERVAL_SECONDS:
  pools = fetchPoolMetrics()           # perceive
  for pool in pools:
    score = scorePool(pool.metrics)    # decide (LLM, heuristic fallback)
    publishAttestation(score)          # act (casper-client put-txn)
```

## 6. Demo walkthrough (for the submission video)

1. **Show the tests** — `cargo test` → 5 passing tests proving access control,
   bounds, sequencing, and reputation.
2. **Show the wasm build** — `cargo odra build` → `wasm/YieldOracle.wasm`.
3. **Deploy to testnet** — `ODRA_CASPER_LIVENET_ENV=casper-test cargo run
   --bin cvo_on_livenet --features=livenet`. Show the contract hash + the
   `AttestationPublished` transaction on `testnet.cspr.live`.
4. **Run the agent** — `cd agent && npm run once`. Show it scoring pools and
   submitting an on-chain attestation (tx hash in logs).
5. **Read it back** — show `latest_attestation` + `reputation_of` returning the
   verifiable on-chain values, and the transaction on the block explorer.

## 7. Why it fits the buildathon criteria

- **Use of AI / Agentic Systems** — autonomous perceive→decide→act loop.
- **Working Smart Contracts** — deployed, transaction-producing Odra contract.
- **Real-World Applicability** — yield/risk oracle is core DeFi infra.
- **Technical Execution** — typed storage, events, access control, tests.
- **Verifiable AI outputs** — on-chain attestations + reputation, a named
  Casper "what you can build" use case.
