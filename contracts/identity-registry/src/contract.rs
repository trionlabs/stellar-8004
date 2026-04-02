use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String, Vec};
use stellar_access::ownable::{self as ownable};
use stellar_macros::only_owner;
use stellar_tokens::non_fungible::{
    Base, ContractOverrides, NonFungibleToken,
};

use crate::errors::IdentityError;
use crate::events;
use crate::storage;
use crate::types::MetadataEntry;

// Custom ContractOverrides that clears agent wallet on transfer
pub struct IdentityBase;

impl ContractOverrides for IdentityBase {
    fn transfer(e: &Env, from: &Address, to: &Address, token_id: u32) {
        storage::remove_agent_wallet(e, token_id);
        Base::transfer(e, from, to, token_id);
    }

    fn transfer_from(e: &Env, spender: &Address, from: &Address, to: &Address, token_id: u32) {
        storage::remove_agent_wallet(e, token_id);
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
        Self::require_owner_or_approved(e, &caller, agent_id)?;
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
        deadline: u64,
        signature: BytesN<64>,
        public_key: BytesN<32>,
    ) -> Result<(), IdentityError> {
        caller.require_auth();
        Self::require_owner_or_approved(e, &caller, agent_id)?;

        let current_ledger = e.ledger().sequence() as u64;
        if deadline < current_ledger {
            return Err(IdentityError::InvalidDeadline);
        }

        // Build message: sha256(agent_id || deadline)
        // The new wallet proves ownership by signing this
        let mut payload = Bytes::new(e);
        payload.append(&Bytes::from_slice(e, &agent_id.to_be_bytes()));
        payload.append(&Bytes::from_slice(e, &deadline.to_be_bytes()));
        let hash = e.crypto().sha256(&payload);

        e.crypto()
            .ed25519_verify(&public_key, &hash.into(), &signature);

        storage::set_agent_wallet(e, agent_id, &new_wallet);
        events::wallet_set(e, agent_id, &new_wallet);
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
        events::wallet_removed(e, agent_id);
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

    // --- Internal ---

    fn require_owner_or_approved(
        e: &Env,
        caller: &Address,
        agent_id: u32,
    ) -> Result<(), IdentityError> {
        let owner = Base::owner_of(e, agent_id);
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
