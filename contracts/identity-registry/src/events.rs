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

/// ERC-8004 spec:
///   `event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);`
///
/// The canonical reference uses this single event for ALL metadata writes,
/// including the reserved `agentWallet` key. We mirror that contract: every
/// wallet write (register, set, unset, transfer-clear) emits a `MetadataSet`
/// with `key = "agentWallet"` and the StrKey-encoded address bytes (or empty
/// bytes on unset). There is no dedicated wallet event - this matches the
/// spec exactly.
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
