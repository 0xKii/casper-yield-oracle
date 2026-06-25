# Deployment — Casper Testnet

The Casper Verifiable Yield Oracle (CVO) is **live on Casper Testnet**.

## On-chain addresses

| Item | Value |
|---|---|
| Network | `casper-test` (Casper Testnet, protocol 2.x) |
| Package hash | `hash-c26ca260dde2e2e5ffcde635807c3420350c0b7ef5fac527691b9674606337a4` |
| Contract hash (v1) | `contract-22f29b889fc92275bd52ead98e997f126e8415e7f781c126ba92f4935620f202` |
| Deployer / genesis agent | `020224855801888926c94ab8c8c04250cab5ff2148a0bca84aacca11d3f9e7b34c03` |
| Account hash | `account-hash-a550f05d360d311f036c3080bfb57aafe640beba8460fe2c0cde35997fdb0fa6` |

## Proof transactions (all executed successfully)

| Action | Transaction hash | Explorer |
|---|---|---|
| Install contract | `004a2323087675671da0cd296a7a55a076e94b1cf7aa5c8e001839d976f445d3` | https://testnet.cspr.live/transaction/004a2323087675671da0cd296a7a55a076e94b1cf7aa5c8e001839d976f445d3 |
| `register_agent` | `f21b873574f01b9bf8b917c331e3d10ed92059b5b2a0dcef157285355212128e` | https://testnet.cspr.live/transaction/f21b873574f01b9bf8b917c331e3d10ed92059b5b2a0dcef157285355212128e |
| `publish` (attestation #1) | `06c19f422b5bb78bbf37c9ae6e52197017c1f4ff824e15d8737edce60855d7f2` | https://testnet.cspr.live/transaction/06c19f422b5bb78bbf37c9ae6e52197017c1f4ff824e15d8737edce60855d7f2 |

Contract package on explorer:
https://testnet.cspr.live/contract-package/c26ca260dde2e2e5ffcde635807c3420350c0b7ef5fac527691b9674606337a4

## How it was deployed

> Note: the Casper Testnet node rejects the `fixed` pricing mode that Odra's
> bundled RPC client uses (`invalid pricing mode`). Deployment therefore uses
> `casper-client` directly with **`classic`** pricing. The wasm is also lowered
> to the MVP feature set (no bulk-memory, no sign-extension) because the Casper
> VM rejects those post-MVP opcodes (`Bulk memory operations are not supported`).

### 1. Build + lower the wasm to MVP

```bash
# Build (nightly toolchain, wasm32 target)
RUSTFLAGS="-C target-feature=-bulk-memory,-sign-ext" \
  cargo +nightly-2026-01-01 build --release \
  --target wasm32-unknown-unknown \
  --bin casper_yield_oracle_build_contract \
  -Z build-std=std,panic_abort

# Lower post-MVP opcodes (needs binaryen >= 123)
wasm-opt --llvm-memory-copy-fill-lowering --signext-lowering \
  --disable-sign-ext --disable-bulk-memory --disable-bulk-memory-opt \
  target/wasm32-unknown-unknown/release/casper_yield_oracle_build_contract.wasm \
  -o wasm/YieldOracle.wasm
```

### 2. Install the contract

```bash
casper-client put-transaction session \
  --node-address https://node.testnet.casper.network \
  --chain-name casper-test \
  --secret-key keys/secret_key.pem \
  --wasm-path wasm/YieldOracle.wasm \
  --pricing-mode classic --payment-amount 400000000000 \
  --standard-payment true --gas-price-tolerance 1 \
  --install-upgrade \
  --session-arg "odra_cfg_is_upgradable:bool='false'" \
  --session-arg "odra_cfg_is_upgrade:bool='false'" \
  --session-arg "odra_cfg_allow_key_override:bool='true'" \
  --session-arg "odra_cfg_package_hash_key_name:string='YieldOracle_package_hash'"
```

### 3. Call entrypoints (register an agent, publish an attestation)

```bash
PKG=package-c26ca260dde2e2e5ffcde635807c3420350c0b7ef5fac527691b9674606337a4

# Register an oracle agent
casper-client put-transaction package \
  --node-address https://node.testnet.casper.network \
  --chain-name casper-test --secret-key keys/secret_key.pem \
  --package-address $PKG --session-entry-point register_agent \
  --pricing-mode classic --payment-amount 3000000000 \
  --standard-payment true --gas-price-tolerance 1 \
  --session-arg "agent:key='account-hash-a550f05d360d311f036c3080bfb57aafe640beba8460fe2c0cde35997fdb0fa6'" \
  --session-arg "label:string='cvo-genesis-agent'"

# Publish a verifiable yield/risk attestation
casper-client put-transaction package \
  --node-address https://node.testnet.casper.network \
  --chain-name casper-test --secret-key keys/secret_key.pem \
  --package-address $PKG --session-entry-point publish \
  --pricing-mode classic --payment-amount 5000000000 \
  --standard-payment true --gas-price-tolerance 1 \
  --session-arg "pool_id:string='CSPR-USDC-demo-pool'" \
  --session-arg "apy_bps:u32='1875'" \
  --session-arg "risk_bps:u32='4200'" \
  --session-arg "confidence_bps:u32='8800'" \
  --session-arg "rationale:string='ai-score:v1 depth-ok vol-moderate'"
```

The autonomous agent (`agent/`) performs step 3 on every cycle; set
`CVO_PACKAGE_HASH`, `CASPER_SECRET_KEY_PATH`, `CASPER_NODE_URL`, and
`CASPER_CHAIN_NAME` (see `agent/.env.sample`).
