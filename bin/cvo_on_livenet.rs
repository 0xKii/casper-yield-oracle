//! Livenet deploy + exercise script for the Casper Verifiable Yield Oracle.
//!
//! Run against Casper testnet:
//!   ODRA_CASPER_LIVENET_ENV=casper-test \
//!     cargo run --bin cvo_on_livenet --features=livenet
//!
//! Requires a funded testnet account secret key and node address configured in
//! the `.env` / `casper-test.env` file (see `.env.sample`).

use casper_yield_oracle::yield_oracle::{YieldOracle, YieldOracleHostRef};
use odra::host::{Deployer, HostEnv, HostRefLoader, NoArgs};
use odra::prelude::*;
use std::str::FromStr;

fn main() {
    let _ = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info"),
    )
    .try_init();
    let env = odra_casper_livenet_env::env();
    let owner = env.caller();
    println!("Deployer / owner address: {}", owner.to_string());

    // Deploy a fresh oracle (or load an existing one, see below).
    let mut oracle = deploy_oracle(&env);
    println!("YieldOracle deployed at: {}", oracle.address().to_string());

    // Register the deployer's own account as the first oracle agent.
    env.set_gas(2_000_000_000u64);
    oracle.register_agent(owner, String::from("cvo-genesis-agent"));
    println!("Registered genesis agent: {}", owner.to_string());

    // Publish a sample attestation (this is a real state-changing tx).
    env.set_gas(3_000_000_000u64);
    oracle.publish(
        String::from("CSPR-USDC-demo-pool"),
        1875,  // 18.75% APY
        4200,  // 42% risk
        8800,  // 88% confidence
        String::from("ai-score:v1 depth-ok vol-moderate"),
    );
    println!("Published attestation #1");

    // Read back the verifiable result (free, executed offline).
    let latest = oracle.latest_attestation(String::from("CSPR-USDC-demo-pool"));
    println!(
        "Latest -> apy_bps={} risk_bps={} confidence_bps={} seq={}",
        latest.apy_bps, latest.risk_bps, latest.confidence_bps, latest.seq
    );
    println!("Agent reputation: {}", oracle.reputation_of(owner));
    println!("Total attestations on-chain: {}", oracle.total());
}

/// Deploys a fresh YieldOracle contract.
pub fn deploy_oracle(env: &HostEnv) -> YieldOracleHostRef {
    env.set_gas(200_000_000_000u64);
    YieldOracle::deploy(env, NoArgs)
}

/// Loads an already-deployed YieldOracle by contract hash.
#[allow(dead_code)]
pub fn load_oracle(env: &HostEnv, address: &str) -> YieldOracleHostRef {
    let address = Address::from_str(address).unwrap();
    YieldOracle::load(env, address)
}
