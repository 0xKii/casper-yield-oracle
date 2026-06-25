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
    `pool_id:string='${poolId}'`,
    `apy_bps:u32='${apy_bps}'`,
    `risk_bps:u32='${risk_bps}'`,
    `confidence_bps:u32='${confidence_bps}'`,
    `rationale:string='${rationale.replace(/'/g, "")}'`,
  ];
}

export function publishAttestation(att, cfg) {
  const {
    nodeUrl,
    chainName,
    secretKeyPath,
    packageHash,
    gas,
    gasPriceTolerance,
  } = cfg;

  const args = publishArgs(att);

  const dryRun =
    !hasCasperClient() ||
    !packageHash ||
    !secretKeyPath ||
    !existsSync(secretKeyPath);

  if (dryRun) {
    return {
      dryRun: true,
      reason: !packageHash
        ? "no CVO_PACKAGE_HASH"
        : !hasCasperClient()
        ? "casper-client not installed"
        : "secret key missing",
      wouldSend: { entrypoint: "publish", args },
    };
  }

  // Casper 2.x: call a stored contract through its package address using
  // `classic` pricing (the testnet node rejects the `fixed` pricing mode).
  const cliArgs = [
    "put-transaction",
    "package",
    "--node-address", nodeUrl,
    "--chain-name", chainName,
    "--secret-key", secretKeyPath,
    "--package-address", packageHash,
    "--session-entry-point", "publish",
    "--pricing-mode", "classic",
    "--payment-amount", String(gas),
    "--standard-payment", "true",
    "--gas-price-tolerance", String(gasPriceTolerance || 1),
  ];
  for (const a of args) cliArgs.push("--session-arg", a);

  const r = spawnSync("casper-client", cliArgs, { encoding: "utf8" });
  if (r.status !== 0) {
    return { dryRun: false, ok: false, error: (r.stderr || r.stdout || "").trim() };
  }
  let deployHash = null;
  try {
    const parsed = JSON.parse(r.stdout);
    const th = parsed?.result?.transaction_hash;
    deployHash =
      (th && (th.Version1 || th.Version2 || th)) ||
      parsed?.result?.deploy_hash ||
      null;
  } catch {
    /* leave null, raw stdout returned below */
  }
  return { dryRun: false, ok: true, deployHash, raw: r.stdout.trim() };
}
