use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String, Vec};
use stellar_access::ownable::{self as ownable};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{Base, ContractOverrides, NonFungibleToken};

use crate::errors::IdentityError;
use crate::events;
use crate::storage::{self, MAX_METADATA_KEYS, MAX_METADATA_KEY_LEN, MAX_METADATA_VALUE_LEN};
use crate::types::MetadataEntry;

// Custom ContractOverrides that clears agent wallet and metadata on transfer.
// Metadata is non-transferable: a previous owner could otherwise hand a victim
// an NFT pre-loaded with claims like `verified=true` or `domain=anthropic.com`.
pub struct IdentityBase;

impl ContractOverrides for IdentityBase {
    fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        storage::remove_agent_wallet(e, token_id);
        storage::clear_all_metadata(e, token_id);
        Base::transfer(e, from, to, token_id);
    }

    fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        storage::remove_agent_wallet(e, token_id);
        storage::clear_all_metadata(e, token_id);
        Base::transfer_from(e, spender, from, to, token_id);
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
        events::registered(e, agent_id, &caller, &String::from_str(e, ""));
        agent_id
    }

    pub fn register_with_uri(e: &Env, caller: Address, agent_uri: String) -> u32 {
        caller.require_auth();
        let agent_id = Base::sequential_mint(e, &caller);
        storage::set_agent_uri(e, agent_id, &agent_uri);
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
        let reserved_wallet_key = String::from_str(e, "agentWallet");
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
        for entry in metadata.iter() {
            storage::set_metadata(e, agent_id, &entry.key, &entry.value);
        }
        events::registered(e, agent_id, &caller, &agent_uri);
        agent_id
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
        if key == String::from_str(e, "agentWallet") {
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

    pub fn get_metadata(e: &Env, agent_id: u32, key: String) -> Option<Bytes> {
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
        events::agent_wallet_set(e, agent_id, &new_wallet, &caller);
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
        events::agent_wallet_unset(e, agent_id, &caller);
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
