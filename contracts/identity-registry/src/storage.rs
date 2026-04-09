use soroban_sdk::{contracttype, Address, Bytes, Env, String, Vec};
use stellar_tokens::non_fungible::{
    NFTStorageKey, BALANCE_EXTEND_AMOUNT, BALANCE_TTL_THRESHOLD, OWNER_EXTEND_AMOUNT,
    OWNER_TTL_THRESHOLD,
};

/// Encodes a Soroban `Address` into the StrKey ASCII bytes (`G...` for
/// ed25519 accounts or `C...` for contract accounts). Always 56 bytes.
///
/// The canonical erc-8004 reference stores `agentWallet` as `bytes` in the
/// metadata mapping (`abi.encodePacked(address)` on EVM = the raw 20-byte
/// address). Stellar addresses don't fit that shape, so we use the StrKey
/// representation as the on-chain bytes encoding. Cross-chain consumers can
/// decode this with any Stellar StrKey decoder.
pub fn address_to_strkey_bytes(e: &Env, addr: &Address) -> Bytes {
    let s = addr.to_string();
    let len = s.len() as usize;
    let mut buf = [0u8; 56];
    s.copy_into_slice(&mut buf[..len]);
    Bytes::from_slice(e, &buf[..len])
}

// TTL_THRESHOLD: when a persistent entry's remaining live-until ledger drops
// below this many ledgers, the next read will bump it back up to TTL_BUMP.
// 518_400 ledgers * 5 seconds / ledger = 2_592_000 seconds = 30 days.
//
// TTL_BUMP: how far ahead to push the live-until ledger when extending.
// 1_036_800 ledgers * 5 seconds / ledger = 60 days.
//
// These constants are duplicated in reputation-registry/src/storage.rs and
// validation-registry/src/storage.rs. If Soroban's nominal block time ever
// changes from 5s/ledger, all three copies must be updated together. The
// architecture-plan-era erc8004-common shared crate that previously held
// these constants was inlined and removed in commit 0e7ef9f.
pub const TTL_THRESHOLD: u32 = 518_400;
pub const TTL_BUMP: u32 = 1_036_800;

// Per-entry size caps for the metadata API. Enforced at the contract entry
// point so a registered agent cannot spam unbounded storage. The 4 KB value
// limit comfortably holds JSON references, signatures, IPFS CIDs, etc.
pub const MAX_METADATA_KEY_LEN: u32 = 64;
pub const MAX_METADATA_VALUE_LEN: u32 = 4096;
// Cap on the number of distinct metadata keys per agent. Bounds the size of
// the MetadataKeys index Vec and bounds the gas of `extend_agent_ttl` and the
// transfer-time clear loop.
pub const MAX_METADATA_KEYS: u32 = 100;

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
    /// Index of metadata keys for an agent. Used by extend_agent_ttl to bump
    /// every Metadata entry and by transfer overrides to clear them all.
    MetadataKeys(u32),
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

    // Bump every metadata entry recorded in the per-agent key index. Note:
    // entries written before the MetadataKeys index existed will not be in
    // the Vec and so will continue to rely on extend-on-read.
    let keys_key = DataKey::MetadataKeys(agent_id);
    if let Some(keys) = e.storage().persistent().get::<_, Vec<String>>(&keys_key) {
        e.storage()
            .persistent()
            .extend_ttl(&keys_key, TTL_THRESHOLD, TTL_BUMP);
        for key in keys.iter() {
            let entry = DataKey::Metadata(agent_id, key);
            if e.storage().persistent().has(&entry) {
                e.storage()
                    .persistent()
                    .extend_ttl(&entry, TTL_THRESHOLD, TTL_BUMP);
            }
        }
    }

    // Extend the OZ NonFungibleToken Owner and Balance entries. OZ extends
    // these on every read in `Base::owner_of` / `Base::balance`, but an agent
    // that goes 30 days without a single privileged call would still archive
    // those entries. extend_ttl must keep the NFT itself alive too, otherwise
    // every cross-contract caller would crash via panic on the next access.
    let owner_key = NFTStorageKey::Owner(agent_id);
    if let Some(owner) = e.storage().persistent().get::<_, Address>(&owner_key) {
        e.storage()
            .persistent()
            .extend_ttl(&owner_key, OWNER_TTL_THRESHOLD, OWNER_EXTEND_AMOUNT);
        let balance_key = NFTStorageKey::Balance(owner);
        if e.storage().persistent().has(&balance_key) {
            e.storage().persistent().extend_ttl(
                &balance_key,
                BALANCE_TTL_THRESHOLD,
                BALANCE_EXTEND_AMOUNT,
            );
        }
    }
}

// --- Agent URI ---

pub fn set_agent_uri(e: &Env, agent_id: u32, uri: &String) {
    let key = DataKey::AgentUri(agent_id);
    e.storage().persistent().set(&key, uri);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
}

pub fn get_agent_uri(e: &Env, agent_id: u32) -> Option<String> {
    let key = DataKey::AgentUri(agent_id);
    let value = e.storage().persistent().get(&key);
    if value.is_some() {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    }
    value
}

// --- Agent Metadata ---

/// Returns true if the new key was inserted (i.e. count increased).
fn record_metadata_key(e: &Env, agent_id: u32, key: &String) -> bool {
    let keys_key = DataKey::MetadataKeys(agent_id);
    let mut keys: Vec<String> = e
        .storage()
        .persistent()
        .get(&keys_key)
        .unwrap_or_else(|| Vec::new(e));

    // Soroban Vec lacks `contains`, so this is O(n) - acceptable given
    // MAX_METADATA_KEYS = 100.
    for existing in keys.iter() {
        if existing == *key {
            return false;
        }
    }

    keys.push_back(key.clone());
    e.storage().persistent().set(&keys_key, &keys);
    e.storage()
        .persistent()
        .extend_ttl(&keys_key, TTL_THRESHOLD, TTL_BUMP);
    true
}

pub fn metadata_key_count(e: &Env, agent_id: u32) -> u32 {
    e.storage()
        .persistent()
        .get::<_, Vec<String>>(&DataKey::MetadataKeys(agent_id))
        .map(|keys| keys.len())
        .unwrap_or(0)
}

pub fn set_metadata(e: &Env, agent_id: u32, key: &String, value: &Bytes) {
    record_metadata_key(e, agent_id, key);
    let entry = DataKey::Metadata(agent_id, key.clone());
    e.storage().persistent().set(&entry, value);
    e.storage()
        .persistent()
        .extend_ttl(&entry, TTL_THRESHOLD, TTL_BUMP);
}

pub fn get_metadata(e: &Env, agent_id: u32, key: &String) -> Option<Bytes> {
    let entry = DataKey::Metadata(agent_id, key.clone());
    let value = e.storage().persistent().get(&entry);
    if value.is_some() {
        e.storage()
            .persistent()
            .extend_ttl(&entry, TTL_THRESHOLD, TTL_BUMP);
    }
    value
}

/// Removes every metadata entry tracked in the MetadataKeys index for an
/// agent, then removes the index itself. Called from the transfer overrides
/// so a new owner does not inherit claims authored by the previous one.
pub fn clear_all_metadata(e: &Env, agent_id: u32) {
    let keys_key = DataKey::MetadataKeys(agent_id);
    if let Some(keys) = e.storage().persistent().get::<_, Vec<String>>(&keys_key) {
        for key in keys.iter() {
            e.storage()
                .persistent()
                .remove(&DataKey::Metadata(agent_id, key));
        }
        e.storage().persistent().remove(&keys_key);
    }
}

// --- Agent Wallet ---

pub fn set_agent_wallet(e: &Env, agent_id: u32, wallet: &Address) {
    let key = DataKey::AgentWallet(agent_id);
    e.storage().persistent().set(&key, wallet);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
}

pub fn get_agent_wallet(e: &Env, agent_id: u32) -> Option<Address> {
    let key = DataKey::AgentWallet(agent_id);
    let value = e.storage().persistent().get(&key);
    if value.is_some() {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    }
    value
}

pub fn remove_agent_wallet(e: &Env, agent_id: u32) {
    e.storage()
        .persistent()
        .remove(&DataKey::AgentWallet(agent_id));
}
