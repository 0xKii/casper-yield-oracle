//! # Casper Verifiable Yield Oracle (CVO) — core module
//!
//! On-chain attestation registry for autonomous AI yield/risk oracle agents.
//!
//! Registered agents publish yield & risk assessments for DeFi pools. Every
//! published attestation is an on-chain, state-changing transaction that also
//! bumps the agent's reputation counter. Anyone can read the latest attestation
//! for a pool and the reputation of any agent — making the AI agent's output
//! verifiable and auditable on Casper.

use odra::prelude::*;

/// Errors emitted by the YieldOracle contract.
#[odra::odra_error]
pub enum Error {
    /// Caller is not the contract owner.
    NotOwner = 1,
    /// Caller is not a registered oracle agent.
    NotRegisteredAgent = 2,
    /// Agent is already registered.
    AgentAlreadyRegistered = 3,
    /// Confidence/risk value must be within 0..=10000 (basis points).
    InvalidBounds = 4,
    /// No attestation exists for the requested pool.
    NoAttestation = 5,
}

/// A single yield/risk attestation produced by an AI oracle agent.
#[odra::odra_type]
pub struct Attestation {
    /// Agent that produced this attestation.
    pub agent: Address,
    /// Identifier of the DeFi pool being scored (free-form, e.g. pool address).
    pub pool_id: String,
    /// Estimated APY in basis points (e.g. 1250 = 12.50%).
    pub apy_bps: u32,
    /// Risk score 0 (safe) .. 10000 (max risk), in basis points.
    pub risk_bps: u32,
    /// Agent confidence 0..=10000 basis points.
    pub confidence_bps: u32,
    /// Free-form rationale / model reference (kept short on-chain).
    pub rationale: String,
    /// Sequential attestation id for this pool.
    pub seq: u64,
}

/// Emitted whenever a new agent is registered.
#[odra::event]
pub struct AgentRegistered {
    pub agent: Address,
    pub label: String,
}

/// Emitted whenever an agent publishes a new attestation.
#[odra::event]
pub struct AttestationPublished {
    pub agent: Address,
    pub pool_id: String,
    pub apy_bps: u32,
    pub risk_bps: u32,
    pub confidence_bps: u32,
    pub seq: u64,
}

/// The Casper Verifiable Yield Oracle contract.
#[odra::module]
pub struct YieldOracle {
    /// Contract owner (can register/revoke agents).
    owner: Var<Address>,
    /// Whether an address is a registered oracle agent.
    agents: Mapping<Address, bool>,
    /// Human-readable label for each agent.
    agent_labels: Mapping<Address, String>,
    /// Reputation: number of accepted attestations per agent.
    reputation: Mapping<Address, u64>,
    /// Latest attestation per pool id.
    latest: Mapping<String, Attestation>,
    /// Monotonic counter per pool id (number of attestations seen).
    pool_seq: Mapping<String, u64>,
    /// Registry of known pool ids (for enumeration in the UI/demo).
    pools: List<String>,
    /// Total attestations published across all pools.
    total_attestations: Var<u64>,
}

#[odra::module]
impl YieldOracle {
    /// Initialize the contract; deployer becomes the owner.
    pub fn init(&mut self) {
        self.owner.set(self.env().caller());
        self.total_attestations.set(0);
    }

    // ----- Owner administration -------------------------------------------

    /// Register a new oracle agent. Owner only.
    pub fn register_agent(&mut self, agent: Address, label: String) {
        self.assert_owner();
        if self.agents.get_or_default(&agent) {
            self.env().revert(Error::AgentAlreadyRegistered);
        }
        self.agents.set(&agent, true);
        self.agent_labels.set(&agent, label.clone());
        self.reputation.set(&agent, 0);
        self.env().emit_event(AgentRegistered { agent, label });
    }

    /// Revoke an agent's registration. Owner only.
    pub fn revoke_agent(&mut self, agent: Address) {
        self.assert_owner();
        self.agents.set(&agent, false);
    }

    // ----- Agent actions (state-changing, produce on-chain txs) -----------

    /// Publish a yield/risk attestation for a pool. Registered agents only.
    ///
    /// This is the core state-changing entrypoint exercised by the autonomous
    /// agent on every cycle — each call is a real Casper transaction.
    pub fn publish(
        &mut self,
        pool_id: String,
        apy_bps: u32,
        risk_bps: u32,
        confidence_bps: u32,
        rationale: String,
    ) {
        let caller = self.env().caller();
        if !self.agents.get_or_default(&caller) {
            self.env().revert(Error::NotRegisteredAgent);
        }
        if confidence_bps > 10000 || risk_bps > 10000 {
            self.env().revert(Error::InvalidBounds);
        }

        let seq = self.pool_seq.get_or_default(&pool_id) + 1;
        self.pool_seq.set(&pool_id, seq);

        // Track newly-seen pools for enumeration.
        if seq == 1 {
            self.pools.push(pool_id.clone());
        }

        let attestation = Attestation {
            agent: caller,
            pool_id: pool_id.clone(),
            apy_bps,
            risk_bps,
            confidence_bps,
            rationale,
            seq,
        };
        self.latest.set(&pool_id, attestation);

        // Bump reputation + global counter.
        let rep = self.reputation.get_or_default(&caller) + 1;
        self.reputation.set(&caller, rep);
        let total = self.total_attestations.get_or_default() + 1;
        self.total_attestations.set(total);

        self.env().emit_event(AttestationPublished {
            agent: caller,
            pool_id,
            apy_bps,
            risk_bps,
            confidence_bps,
            seq,
        });
    }

    // ----- Read-only views (free, executed offline by Livenet) ------------

    /// Returns whether an address is a registered agent.
    pub fn is_agent(&self, agent: Address) -> bool {
        self.agents.get_or_default(&agent)
    }

    /// Returns an agent's reputation (count of accepted attestations).
    pub fn reputation_of(&self, agent: Address) -> u64 {
        self.reputation.get_or_default(&agent)
    }

    /// Returns the latest attestation for a pool, reverting if none exists.
    pub fn latest_attestation(&self, pool_id: String) -> Attestation {
        match self.latest.get(&pool_id) {
            Some(a) => a,
            None => self.env().revert(Error::NoAttestation),
        }
    }

    /// Returns the number of attestations recorded for a pool.
    pub fn pool_sequence(&self, pool_id: String) -> u64 {
        self.pool_seq.get_or_default(&pool_id)
    }

    /// Returns the total number of attestations across all pools.
    pub fn total(&self) -> u64 {
        self.total_attestations.get_or_default()
    }

    /// Returns the number of distinct pools tracked.
    pub fn pool_count(&self) -> u32 {
        self.pools.len()
    }

    /// Returns the pool id at a given index (for enumeration).
    pub fn pool_at(&self, index: u32) -> Option<String> {
        self.pools.get(index)
    }

    // ----- Internal helpers ------------------------------------------------

    fn assert_owner(&self) {
        let owner = match self.owner.get() {
            Some(o) => o,
            None => self.env().revert(Error::NotOwner),
        };
        if self.env().caller() != owner {
            self.env().revert(Error::NotOwner);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv, NoArgs};

    fn setup() -> (HostEnv, YieldOracleHostRef) {
        let env = odra_test::env();
        let contract = YieldOracle::deploy(&env, NoArgs);
        (env, contract)
    }

    #[test]
    fn owner_can_register_and_agent_can_publish() {
        let (env, mut c) = setup();
        let owner = env.get_account(0);
        let agent = env.get_account(1);

        env.set_caller(owner);
        c.register_agent(agent, String::from("cvo-agent-1"));
        assert!(c.is_agent(agent));
        assert_eq!(c.reputation_of(agent), 0);

        env.set_caller(agent);
        c.publish(
            String::from("pool-AAA"),
            1250,
            3000,
            9000,
            String::from("stable vol, healthy depth"),
        );

        let latest = c.latest_attestation(String::from("pool-AAA"));
        assert_eq!(latest.apy_bps, 1250);
        assert_eq!(latest.risk_bps, 3000);
        assert_eq!(latest.seq, 1);
        assert_eq!(c.reputation_of(agent), 1);
        assert_eq!(c.total(), 1);
        assert_eq!(c.pool_count(), 1);
    }

    #[test]
    fn unregistered_agent_cannot_publish() {
        let (env, mut c) = setup();
        let stranger = env.get_account(2);
        env.set_caller(stranger);
        let res = c.try_publish(
            String::from("pool-BBB"),
            100,
            100,
            100,
            String::from("x"),
        );
        assert_eq!(res, Err(Error::NotRegisteredAgent.into()));
    }

    #[test]
    fn non_owner_cannot_register() {
        let (env, mut c) = setup();
        let stranger = env.get_account(2);
        let agent = env.get_account(1);
        env.set_caller(stranger);
        let res = c.try_register_agent(agent, String::from("x"));
        assert_eq!(res, Err(Error::NotOwner.into()));
    }

    #[test]
    fn bounds_enforced() {
        let (env, mut c) = setup();
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        env.set_caller(owner);
        c.register_agent(agent, String::from("a"));
        env.set_caller(agent);
        let res = c.try_publish(
            String::from("pool-CCC"),
            100,
            20000, // > 10000 -> invalid
            100,
            String::from("x"),
        );
        assert_eq!(res, Err(Error::InvalidBounds.into()));
    }

    #[test]
    fn sequence_increments_per_pool() {
        let (env, mut c) = setup();
        let owner = env.get_account(0);
        let agent = env.get_account(1);
        env.set_caller(owner);
        c.register_agent(agent, String::from("a"));
        env.set_caller(agent);
        c.publish(String::from("pool-D"), 1, 1, 1, String::from("a"));
        c.publish(String::from("pool-D"), 2, 2, 2, String::from("b"));
        assert_eq!(c.pool_sequence(String::from("pool-D")), 2);
        assert_eq!(c.latest_attestation(String::from("pool-D")).seq, 2);
        assert_eq!(c.pool_count(), 1); // same pool, not double-counted
    }
}
