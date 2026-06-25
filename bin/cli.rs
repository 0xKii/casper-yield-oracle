//! Minimal `odra-cli` integration for the Casper Verifiable Yield Oracle.
//!
//! Provides a `deploy` script so the contract can be deployed and stored in the
//! local container, and a `publish` scenario that calls the core entrypoint.

use casper_yield_oracle::yield_oracle::YieldOracle;
use odra::host::{HostEnv, NoArgs};
use odra::schema::casper_contract_schema::NamedCLType;
use odra_cli::{
    deploy::DeployScript,
    scenario::{Args, Error, Scenario, ScenarioMetadata},
    CommandArg, DeployedContractsContainer, DeployerExt, OdraCli,
};

/// Deploys the `YieldOracle` and adds it to the container.
pub struct OracleDeployScript;

impl DeployScript for OracleDeployScript {
    fn deploy(
        &self,
        env: &HostEnv,
        container: &mut DeployedContractsContainer,
    ) -> Result<(), odra_cli::deploy::Error> {
        let _oracle = YieldOracle::load_or_deploy(env, NoArgs, container, 300_000_000_000)?;
        Ok(())
    }
}

/// Scenario that publishes an attestation for a pool.
pub struct PublishScenario;

impl Scenario for PublishScenario {
    fn args(&self) -> Vec<CommandArg> {
        vec![
            CommandArg::new("pool_id", "Pool identifier", NamedCLType::String),
            CommandArg::new("apy_bps", "APY in basis points", NamedCLType::U32),
            CommandArg::new("risk_bps", "Risk in basis points", NamedCLType::U32),
            CommandArg::new("confidence_bps", "Confidence in basis points", NamedCLType::U32),
            CommandArg::new("rationale", "Short rationale", NamedCLType::String),
        ]
    }

    fn run(
        &self,
        env: &HostEnv,
        container: &DeployedContractsContainer,
        args: Args,
    ) -> Result<(), Error> {
        let mut oracle = container.contract_ref::<YieldOracle>(env)?;
        let pool_id = args.get_single::<String>("pool_id")?;
        let apy_bps = args.get_single::<u32>("apy_bps")?;
        let risk_bps = args.get_single::<u32>("risk_bps")?;
        let confidence_bps = args.get_single::<u32>("confidence_bps")?;
        let rationale = args.get_single::<String>("rationale")?;

        env.set_gas(3_000_000_000u64);
        oracle.try_publish(pool_id, apy_bps, risk_bps, confidence_bps, rationale)?;
        Ok(())
    }
}

impl ScenarioMetadata for PublishScenario {
    const NAME: &'static str = "publish";
    const DESCRIPTION: &'static str = "Publish a yield/risk attestation for a pool";
}

/// Main function to run the CLI tool.
pub fn main() {
    OdraCli::new()
        .about("CLI tool for the Casper Verifiable Yield Oracle")
        .deploy(OracleDeployScript)
        .contract::<YieldOracle>()
        .scenario(PublishScenario)
        .build()
        .run();
}
