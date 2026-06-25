// On-chain publisher.
//
// Submits `publish(...)` calls to the deployed YieldOracle contract on Casper
// testnet using the `casper-client` CLI (put-deploy / put-txn). This keeps the
// agent dependency-light and mirrors the official tooling.
//
// If `casper-client` or the contract hash is missing, runs in DRY-RUN mode and
// just prints the deploy it WOULD send — so the loop is demonstrable offline.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function hasCasperClient() {
  const r = spawnSync("casper-client", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

// Build the session-args for the publish entrypoint.
function publishArgs({ poolId, apy_bps, risk_bps, confidence_bps, rationale }) {
  return [
    `pool_id:String='${poolId}'`,
    `apy_bps:u32='${apy_bps}'`,
    `risk_bps:u32='${risk_bps}'`,
    `confidence_bps:u32='${confidence_bps}'`,
    `rationale:String='${rationale.replace(/'/g, "")}'`,
  ];
}

export function publishAttestation(att, cfg) {
  const {
    nodeUrl,
    chainName,
    secretKeyPath,
    contractHash,
    gas,
  } = cfg;

  const args = publishArgs(att);

  const dryRun =
    !hasCasperClient() ||
    !contractHash ||
    !secretKeyPath ||
    !existsSync(secretKeyPath);

  if (dryRun) {
    return {
      dryRun: true,
      reason: !contractHash
        ? "no CVO_CONTRACT_HASH"
        : !hasCasperClient()
        ? "casper-client not installed"
        : "secret key missing",
      wouldSend: { entrypoint: "publish", args },
    };
  }

  // Use put-txn (Casper 2.0) to call a stored contract by hash.
  const cliArgs = [
    "put-txn",
    "invocable-entity",
    "--node-address", nodeUrl,
    "--chain-name", chainName,
    "--secret-key", secretKeyPath,
    "--payment-amount", String(gas),
    "--entity-address", contractHash,
    "--session-entry-point", "publish",
  ];
  for (const a of args) cliArgs.push("--session-arg", a);

  const r = spawnSync("casper-client", cliArgs, { encoding: "utf8" });
  if (r.status !== 0) {
    return { dryRun: false, ok: false, error: (r.stderr || r.stdout || "").trim() };
  }
  let deployHash = null;
  try {
    const parsed = JSON.parse(r.stdout);
    deployHash =
      parsed?.result?.transaction_hash ||
      parsed?.result?.deploy_hash ||
      null;
  } catch {
    /* leave null, raw stdout returned below */
  }
  return { dryRun: false, ok: true, deployHash, raw: r.stdout.trim() };
}
