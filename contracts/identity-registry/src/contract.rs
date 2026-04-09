use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String, Vec};
use stellar_access::ownable::{self as ownable};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{Base, ContractOverrides, NonFungibleToken};

use crate::errors::IdentityError;
use crate::events;
use crate::storage::{
    self, address_to_strkey_bytes, MAX_METADATA_KEYS, MAX_METADATA_KEY_LEN, MAX_METADATA_VALUE_LEN,
};
use crate::types::MetadataEntry;

/// The reserved metadata key for the per-agent operational wallet, per the
/// canonical erc-8004 reference. Cross-chain consumers SHOULD treat this
/// metadata key the same way the EVM reference does.
fn agent_wallet_key(e: &Env) -> String {
    String::from_str(e, "agentWallet")
}

// Custom ContractOverrides that clears agent wallet and metadata on transfer.
// Metadata is non-transferable: a previous owner could otherwise hand a victim
// an NFT pre-loaded with claims like `verified=true` or `domain=anthropic.com`.
pub struct IdentityBase;

impl ContractOverrides for IdentityBase {
    fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        storage::remove_agent_wallet(e, token_id);
        storage::clear_all_metadata(e, token_id);
        // Mirror the canonical reference: a transfer emits a MetadataSet
        // event with the empty bytes value for the reserved `agentWallet`
        // key, signaling that the new owner must re-authorize a wallet.
        events::metadata_set(e, token_id, &agent_wallet_key(e), &Bytes::new(e));
        Base::transfer(e, from, to, token_id);
    }

    fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        storage::remove_agent_wallet(e, token_id);
        storage::clear_all_metadata(e, token_id);
        events::metadata_set(e, token_id, &agent_wallet_key(e), &Bytes::new(e));
        Base::transfer_from(e, spender, from, to, token_id);
    }

    /// ERC-8004 inherits IERC721Metadata, which requires `tokenURI(tokenId)`
    /// to return the agent's URI. The default OZ implementation returns
    /// `base_uri + token_id`, and our base URI is empty, so without this
    /// override `token_uri` would return an empty string for every agent.
    /// The reference Solidity implementation overrides `_tokenURI` to return
    /// the per-agent URI; we mirror that here so cross-chain consumers
    /// reading via the standard `IERC721Metadata` interface get a useful
    /// value. We still panic on a missing token via `Base::owner_of` to
    /// match the OZ default semantics.
    fn token_uri(e: &Env, token_id: u32) -> String {
        let _ = Base::owner_of(e, token_id);
        storage::get_agent_uri(e, token_id).unwrap_or_else(|| String::from_str(e, ""))
    }
}

#[contract]
pub struct IdentityRegistryContract;

#[contractimpl]
impl IdentityRegistryContract {
    pub fn __constructor(e: &Env, owner: Address, name: String, symbol: String) {
        Base::set_metadata(e, String::from_str(e, ""), name, symbol);
        ownable::set_owner(e, &owner);
    }

    // --- Registration ---

    pub fn register(e: &Env, caller: Address) -> u32 {
        caller.require_auth();
        let agent_id = Base::sequential_mint(e, &caller);
        Self::init_agent_wallet(e, agent_id, &caller);
        events::registered(e, agent_id, &caller, &String::from_str(e, ""));
        agent_id
    }

    pub fn register_with_uri(e: &Env, caller: Address, agent_uri: String) -> u32 {
        caller.require_auth();
        let agent_id = Base::sequential_mint(e, &caller);
        storage::set_agent_uri(e, agent_id, &agent_uri);
        Self::init_agent_wallet(e, agent_id, &caller);
        events::registered(e, agent_id, &caller, &agent_uri);
        agent_id
    }

    pub fn register_full(
        e: &Env,
        caller: Address,
        agent_uri: String,
        metadata: Vec<MetadataEntry>,
    ) -> u32 {
        caller.require_auth();
        // Length validation matches `set_metadata`. Out-of-bounds entries
        // panic here because the public signature returns u32, not Result.
        // Callers must enforce the limits client-side or use `set_metadata`
        // for incremental writes that surface errors cleanly.
        let reserved_wallet_key = agent_wallet_key(e);
        assert!(
            metadata.len() <= MAX_METADATA_KEYS,
            "too many metadata entries"
        );
        for entry in metadata.iter() {
            assert!(
                entry.key.len() <= MAX_METADATA_KEY_LEN,
                "metadata key too long"
            );
            assert!(
                entry.value.len() <= MAX_METADATA_VALUE_LEN,
                "metadata value too long"
            );
            // ERC-8004: `agentWallet` is reserved. Reject so a caller cannot
            // smuggle in a fake wallet binding via the metadata path.
            assert!(
                entry.key != reserved_wallet_key,
                "agentWallet is a reserved metadata key - use set_agent_wallet"
            );
        }
        let agent_id = Base::sequential_mint(e, &caller);
        storage::set_agent_uri(e, agent_id, &agent_uri);
        Self::init_agent_wallet(e, agent_id, &caller);
        for entry in metadata.iter() {
            storage::set_metadata(e, agent_id, &entry.key, &entry.value);
            events::metadata_set(e, agent_id, &entry.key, &entry.value);
        }
        events::registered(e, agent_id, &caller, &agent_uri);
        agent_id
    }

    /// Spec parity with the canonical erc-8004 reference: every `register*`
    /// initializes the `agentWallet` reserved metadata key to the caller's
    /// address and emits a `MetadataSet` event for it. The off-chain layer
    /// reads this event to populate `agents.agent_wallet`.
    fn init_agent_wallet(e: &Env, agent_id: u32, owner: &Address) {
        storage::set_agent_wallet(e, agent_id, owner);
        let bytes = address_to_strkey_bytes(e, owner);
        events::metadata_set(e, agent_id, &agent_wallet_key(e), &bytes);
    }

    // --- URI ---

    pub fn set_agent_uri(
        e: &Env,
        caller: Address,
        agent_id: u32,
        new_uri: String,
    ) -> Result<(), IdentityError> {
        caller.require_auth();
        // ERC-8004 reference rejects empty URIs.
        if new_uri.len() == 0 {
            return Err(IdentityError::EmptyValue);
        }
        Self::require_owner_or_approved(e, &caller, agent_id)?;
        storage::set_agent_uri(e, agent_id, &new_uri);
        events::uri_updated(e, agent_id, &caller, &new_uri);
        Ok(())
    }

    pub fn agent_uri(e: &Env, agent_id: u32) -> Result<String, IdentityError> {
        storage::get_agent_uri(e, agent_id).ok_or(IdentityError::UriNotSet)
    }

    // --- Metadata ---

    pub fn set_metadata(
        e: &Env,
        caller: Address,
        agent_id: u32,
        key: String,
        value: Bytes,
    ) -> Result<(), IdentityError> {
        caller.require_auth();
        // ERC-8004 reference rejects empty metadata keys.
        if key.len() == 0 {
            return Err(IdentityError::EmptyValue);
        }
        if key.len() > MAX_METADATA_KEY_LEN {
            return Err(IdentityError::MetadataKeyTooLong);
        }
        if value.len() > MAX_METADATA_VALUE_LEN {
            return Err(IdentityError::MetadataValueTooLong);
        }
        // ERC-8004: `agentWallet` is reserved and must be settable only via
        // the dedicated entry point with wallet auth. Reject so a caller
        // cannot smuggle a fake binding through the metadata path.
        if key == agent_wallet_key(e) {
            return Err(IdentityError::ReservedMetadataKey);
        }
        Self::require_owner_or_approved(e, &caller, agent_id)?;
        // Reject the write if it would create a new key beyond the per-agent
        // cap. Updates to existing keys are always allowed.
        let existing_value = storage::get_metadata(e, agent_id, &key);
        if existing_value.is_none() && storage::metadata_key_count(e, agent_id) >= MAX_METADATA_KEYS
        {
            return Err(IdentityError::TooManyMetadataKeys);
        }
        storage::set_metadata(e, agent_id, &key, &value);
        events::metadata_set(e, agent_id, &key, &value);
        Ok(())
    }

    /// ERC-8004 spec: `getMetadata(agentId, "agentWallet")` MUST return the
    /// per-agent wallet bytes. We store the wallet as a typed `Address` in a
    /// dedicated slot rather than in the metadata mapping; the special-case
    /// here makes the spec view contract correct without duplicating storage.
    pub fn get_metadata(e: &Env, agent_id: u32, key: String) -> Option<Bytes> {
        if key == agent_wallet_key(e) {
            return storage::get_agent_wallet(e, agent_id)
                .map(|addr| address_to_strkey_bytes(e, &addr));
        }
        storage::get_metadata(e, agent_id, &key)
    }

    // --- Agent Wallet ---

    pub fn set_agent_wallet(
        e: &Env,
        caller: Address,
        agent_id: u32,
        new_wallet: Address,
    ) -> Result<(), IdentityError> {
        caller.require_auth();
        new_wallet.require_auth();
        Self::require_owner_or_approved(e, &caller, agent_id)?;
        storage::set_agent_wallet(e, agent_id, &new_wallet);
        // Spec parity: emit a MetadataSet event for the reserved
        // `agentWallet` key. The canonical erc-8004 reference does NOT have
        // a dedicated wallet event - all wallet writes flow through the
        // metadata event surface.
        let bytes = address_to_strkey_bytes(e, &new_wallet);
        events::metadata_set(e, agent_id, &agent_wallet_key(e), &bytes);
        Ok(())
    }

    pub fn get_agent_wallet(e: &Env, agent_id: u32) -> Option<Address> {
        storage::get_agent_wallet(e, agent_id)
    }

    pub fn unset_agent_wallet(
        e: &Env,
        caller: Address,
        agent_id: u32,
    ) -> Result<(), IdentityError> {
        caller.require_auth();
        Self::require_owner_or_approved(e, &caller, agent_id)?;
        storage::remove_agent_wallet(e, agent_id);
        // Spec parity: empty bytes value signals the unset, mirroring the
        // EVM reference's `$._metadata[agentId]["agentWallet"] = ""`.
        events::metadata_set(e, agent_id, &agent_wallet_key(e), &Bytes::new(e));
        Ok(())
    }

    // --- TTL ---

    pub fn extend_ttl(e: &Env, agent_id: u32) {
        storage::extend_instance_ttl(e);
        storage::extend_agent_ttl(e, agent_id);
    }

    // --- Admin ---

    #[only_owner]
    pub fn upgrade(e: &Env, new_wasm_hash: BytesN<32>) {
        e.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn version(e: &Env) -> String {
        String::from_str(e, "0.1.0")
    }

    /// Returns the owner of an agent, or `None` if the agent does not exist
    /// (or its NFT entry has been archived). Cross-contract callers must use
    /// this instead of `owner_of`, which panics on missing tokens.
    pub fn find_owner(e: &Env, agent_id: u32) -> Option<Address> {
        storage::find_owner(e, agent_id)
    }

    /// ERC-8004 spec: returns true if an agent has been minted and not
    /// burned. The reference reputation registry uses this in its
    /// `giveFeedback` precondition. Functionally identical to `find_owner`
    /// returning `Some` but exposed under the spec name for cross-chain
    /// binding compatibility.
    pub fn agent_exists(e: &Env, agent_id: u32) -> bool {
        storage::find_owner(e, agent_id).is_some()
    }

    /// ERC-8004 spec: `isAuthorizedOrOwner(spender, agentId) -> bool`. The
    /// canonical reputation registry uses THIS single view for self-feedback
    /// prevention - any caller for whom this returns true is rejected from
    /// `giveFeedback` because they are the agent owner or an approved
    /// operator. Returns `false` (rather than panicking) when the agent does
    /// not exist, so cross-contract callers can fold the check into a single
    /// branch.
    pub fn is_authorized_or_owner(e: &Env, spender: Address, agent_id: u32) -> bool {
        let owner = match storage::find_owner(e, agent_id) {
            Some(o) => o,
            None => return false,
        };
        if spender == owner {
            return true;
        }
        if let Some(approved) = Base::get_approved(e, agent_id) {
            if spender == approved {
                return true;
            }
        }
        Base::is_approved_for_all(e, &owner, &spender)
    }

    /// ERC-8004 spec: returns the total number of agents ever minted.
    /// Backed by the OZ NFT sequential mint counter, which never decreases
    /// (we don't expose a burn path).
    pub fn total_agents(e: &Env) -> u32 {
        stellar_tokens::non_fungible::sequential::next_token_id(e)
    }

    // --- Internal ---

    fn require_owner_or_approved(
        e: &Env,
        caller: &Address,
        agent_id: u32,
    ) -> Result<(), IdentityError> {
        let owner = storage::find_owner(e, agent_id).ok_or(IdentityError::AgentNotFound)?;
        if *caller == owner {
            return Ok(());
        }
        if let Some(approved) = Base::get_approved(e, agent_id) {
            if *caller == approved {
                return Ok(());
            }
        }
        if Base::is_approved_for_all(e, &owner, caller) {
            return Ok(());
        }
        Err(IdentityError::NotOwnerOrApproved)
    }
}

#[contractimpl(contracttrait)]
impl NonFungibleToken for IdentityRegistryContract {
    type ContractType = IdentityBase;
}
