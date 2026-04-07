use soroban_sdk::{contractevent, Address, Bytes, Env, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registered {
    #[topic]
    pub agent_id: u32,
    #[topic]
    pub owner: Address,
    pub agent_uri: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UriUpdated {
    #[topic]
    pub agent_id: u32,
    #[topic]
    pub updated_by: Address,
    pub new_uri: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataSet {
    #[topic]
    pub agent_id: u32,
    /// ERC-8004 spec lists this as an indexed topic so subscribers can filter
    /// by metadata key on-chain. The same value is also exposed below as a
    /// data field for ergonomic decoding.
    #[topic]
    pub key: String,
    pub value: Bytes,
}

/// ERC-8004 spec event:
///   `event AgentWalletSet(uint256 indexed agentId, address indexed newWallet, address indexed setBy);`
///
/// All three fields are indexed in the spec. We match the spec's name and
/// index three topics. The `set_by` field is required by the spec to give
/// off-chain filters access to who initiated the binding (typically the
/// agent owner or an approved operator).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentWalletSet {
    #[topic]
    pub agent_id: u32,
    #[topic]
    pub new_wallet: Address,
    #[topic]
    pub set_by: Address,
}

/// Soroban has no `address(0)` sentinel, so we cannot reuse the spec's
/// `AgentWalletSet(agentId, address(0), setBy)` pattern for unset events.
/// Emit a separate `AgentWalletUnset` instead. Cross-chain subscribers
/// reading the spec event need to also listen for this companion event.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentWalletUnset {
    #[topic]
    pub agent_id: u32,
    #[topic]
    pub set_by: Address,
}

pub fn registered(e: &Env, agent_id: u32, owner: &Address, agent_uri: &String) {
    Registered {
        agent_id,
        owner: owner.clone(),
        agent_uri: agent_uri.clone(),
    }
    .publish(e);
}

pub fn uri_updated(e: &Env, agent_id: u32, updated_by: &Address, new_uri: &String) {
    UriUpdated {
        agent_id,
        updated_by: updated_by.clone(),
        new_uri: new_uri.clone(),
    }
    .publish(e);
}

pub fn metadata_set(e: &Env, agent_id: u32, key: &String, value: &Bytes) {
    MetadataSet {
        agent_id,
        key: key.clone(),
        value: value.clone(),
    }
    .publish(e);
}

pub fn agent_wallet_set(e: &Env, agent_id: u32, new_wallet: &Address, set_by: &Address) {
    AgentWalletSet {
        agent_id,
        new_wallet: new_wallet.clone(),
        set_by: set_by.clone(),
    }
    .publish(e);
}

pub fn agent_wallet_unset(e: &Env, agent_id: u32, set_by: &Address) {
    AgentWalletUnset {
        agent_id,
        set_by: set_by.clone(),
    }
    .publish(e);
}
