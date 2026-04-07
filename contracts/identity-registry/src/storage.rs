use soroban_sdk::{contracttype, Address, Bytes, Env, String};
use stellar_tokens::non_fungible::NFTStorageKey;

// ~30 days at 5s/ledger
pub const TTL_THRESHOLD: u32 = 518_400;
// ~60 days
pub const TTL_BUMP: u32 = 1_036_800;

/// Reads the OZ NonFungibleToken owner entry directly. Returns `None` for
/// missing or archived tokens; `Base::owner_of` panics in the same case,
/// which is unsafe in cross-contract callers.
///
/// Named `find_owner` because `try_owner_of` is reserved by the soroban-sdk
/// `#[contractimpl]` macro for the auto-generated fallible companion of the
/// `owner_of` method inherited from the OZ NonFungibleToken trait.
pub fn find_owner(e: &Env, agent_id: u32) -> Option<Address> {
    e.storage()
        .persistent()
        .get::<_, Address>(&NFTStorageKey::Owner(agent_id))
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    AgentUri(u32),
    Metadata(u32, String),
    AgentWallet(u32),
}

pub fn extend_instance_ttl(e: &Env) {
    e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
}

pub fn extend_agent_ttl(e: &Env, agent_id: u32) {
    let key = DataKey::AgentUri(agent_id);
    if e.storage().persistent().has(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    }
    let wallet_key = DataKey::AgentWallet(agent_id);
    if e.storage().persistent().has(&wallet_key) {
        e.storage()
            .persistent()
            .extend_ttl(&wallet_key, TTL_THRESHOLD, TTL_BUMP);
    }
}

// --- Agent URI ---

pub fn set_agent_uri(e: &Env, agent_id: u32, uri: &String) {
    e.storage()
        .persistent()
        .set(&DataKey::AgentUri(agent_id), uri);
}

pub fn get_agent_uri(e: &Env, agent_id: u32) -> Option<String> {
    e.storage().persistent().get(&DataKey::AgentUri(agent_id))
}

// --- Agent Metadata ---

pub fn set_metadata(e: &Env, agent_id: u32, key: &String, value: &Bytes) {
    e.storage()
        .persistent()
        .set(&DataKey::Metadata(agent_id, key.clone()), value);
}

pub fn get_metadata(e: &Env, agent_id: u32, key: &String) -> Option<Bytes> {
    e.storage()
        .persistent()
        .get(&DataKey::Metadata(agent_id, key.clone()))
}

// --- Agent Wallet ---

pub fn set_agent_wallet(e: &Env, agent_id: u32, wallet: &Address) {
    e.storage()
        .persistent()
        .set(&DataKey::AgentWallet(agent_id), wallet);
}

pub fn get_agent_wallet(e: &Env, agent_id: u32) -> Option<Address> {
    e.storage()
        .persistent()
        .get(&DataKey::AgentWallet(agent_id))
}

pub fn remove_agent_wallet(e: &Env, agent_id: u32) {
    e.storage()
        .persistent()
        .remove(&DataKey::AgentWallet(agent_id));
}
