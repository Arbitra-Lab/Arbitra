use soroban_sdk::{contracttype, Address, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Agent(Address),
    State,
    Initialized,
    AgentCount,
    Transaction(String),
    AgentRating(Address, Address),
    UpgradeProposal(String),
    Stake(Address),
    Reputation(Address),
    StakeConfig,
    SlashedPool,
    /// Policy governing outcome-signal consequences (set by admin).
    OutcomePolicy,
    /// Allowlist flag for an address authorized to submit outcome signals.
    OutcomeReporter(Address),
    /// Per-agent list of slashing events.
    SlashHistory(Address),
}
