use soroban_sdk::{
    contract, contractclient, contractimpl, panic_with_error, Address, BytesN, Env, String, Vec,
};
use stellar_access::ownable::{self as ownable, Ownable};
use stellar_macros::only_owner;

use crate::errors::ValidationError;
use crate::events;
use crate::storage;
use crate::types::{ValidationStatus, ValidationSummary};

// get_summary windows over answered validations only, so requests that are
// never answered cannot push an answer out. Each validation it reads costs two
// ledger entries (index slot and status). With validators listed it reads up to
// MAX_SUMMARY_VALIDATIONS answers per validator: 5 count entries + 5 x 32 x 2
// slots and statuses + instance + code = 327 entries, within mainnet's
// per-transaction footprint limit of 400 (tx_max_footprint_entries), as in the
// reputation registry. Without validators: 1 + 32 x 2 + instance + code = 67.
// The 325 persistent entries of the full read must be live: archived entries
// count against the 200-entry disk-read limit (tx_max_disk_read_entries).
pub(crate) const MAX_SUMMARY_VALIDATORS: u32 = 5;
pub(crate) const MAX_SUMMARY_VALIDATIONS: u32 = 32;
// Bytes per validation tag, as in the reputation registry; the SDK's
// validateTag uses the same limit. Bounds what each status read costs.
pub(crate) const MAX_TAG_LEN: u32 = 64;

// Cross-contract auth delegates to identity registry; share custody.
#[contractclient(name = "IdentityRegistryClient")]
pub trait IdentityRegistryInterface {
    fn find_owner(e: &Env, agent_id: u32) -> Option<Address>;
    fn agent_exists(e: &Env, agent_id: u32) -> bool;
    fn get_approved(e: &Env, token_id: u32) -> Option<Address>;
    fn is_approved_for_all(e: &Env, owner: Address, operator: Address) -> bool;
    fn is_authorized_or_owner(e: &Env, spender: Address, agent_id: u32) -> bool;
    fn get_agent_wallet(e: &Env, agent_id: u32) -> Option<Address>;
}

#[contract]
pub struct ValidationRegistryContract;

#[contractimpl]
impl ValidationRegistryContract {
    pub fn __constructor(e: &Env, owner: Address, identity_registry: Address) {
        ownable::set_owner(e, &owner);
        storage::set_identity_registry(e, &identity_registry);
    }

    pub fn validation_request(
        e: &Env,
        caller: Address,
        validator_address: Address,
        agent_id: u32,
        request_uri: String,
        request_hash: BytesN<32>,
    ) -> Result<(), ValidationError> {
        caller.require_auth();

        let identity_addr = storage::get_identity_registry(e);
        let identity = IdentityRegistryClient::new(e, &identity_addr);
        let owner = identity
            .find_owner(&agent_id)
            .ok_or(ValidationError::AgentNotFound)?;
        // Whoever acts for the agent must not validate it: the requester, the owner,
        // an approved operator and the bound agentWallet. These are the addresses the
        // reputation registry rejects as self-feedback. Off-chain ties cannot be seen.
        if validator_address == caller
            || identity.is_authorized_or_owner(&validator_address, &agent_id)
            || identity.get_agent_wallet(&agent_id) == Some(validator_address.clone())
        {
            return Err(ValidationError::ValidatorNotIndependent);
        }
        if caller != owner {
            let mut authorized = false;
            if let Some(approved) = identity.get_approved(&agent_id) {
                if caller == approved {
                    authorized = true;
                }
            }
            if !authorized && identity.is_approved_for_all(&owner, &caller) {
                authorized = true;
            }
            if !authorized {
                return Err(ValidationError::NotOwnerOrApproved);
            }
        }

        if storage::has_validation(e, &request_hash) {
            return Err(ValidationError::RequestAlreadyExists);
        }

        let status = ValidationStatus {
            validator_address: validator_address.clone(),
            agent_id,
            response: 0,
            response_hash: BytesN::from_array(e, &[0u8; 32]),
            tag: String::from_str(e, ""),
            last_update: e.ledger().sequence() as u64,
            has_response: false,
        };
        storage::set_validation(e, &request_hash, &status);
        storage::add_agent_validation(e, agent_id, &request_hash)?;
        storage::add_validator_request(e, &validator_address, &request_hash)?;

        events::validation_requested(e, &validator_address, agent_id, &request_hash, &request_uri);

        Ok(())
    }

    /// Responses are updateable (progressive validation); only original validator can update.
    pub fn validation_response(
        e: &Env,
        caller: Address,
        request_hash: BytesN<32>,
        response: u32,
        response_uri: String,
        response_hash: BytesN<32>,
        tag: String,
    ) -> Result<(), ValidationError> {
        caller.require_auth();

        if response > 100 {
            return Err(ValidationError::InvalidResponse);
        }
        if tag.len() > MAX_TAG_LEN {
            return Err(ValidationError::TagTooLong);
        }

        let mut status =
            storage::get_validation(e, &request_hash).ok_or(ValidationError::RequestNotFound)?;

        if caller != status.validator_address {
            return Err(ValidationError::NotDesignatedValidator);
        }

        status.response = response;
        status.response_hash = response_hash.clone();
        status.tag = tag.clone();
        status.last_update = e.ledger().sequence() as u64;
        status.has_response = true;
        storage::set_validation(e, &request_hash, &status);
        // The first v2 response indexes the validation for get_summary. Later
        // updates keep its place. Answers given under v1 are not indexed until
        // their validator updates them under v2.
        if !storage::is_answer_indexed(e, &request_hash) {
            storage::index_answer(e, &request_hash, status.agent_id, &status.validator_address)?;
        }

        events::validation_responded(
            e,
            &status.validator_address,
            status.agent_id,
            &request_hash,
            response,
            &response_uri,
            &response_hash,
            &tag,
        );

        Ok(())
    }

    // --- Read functions ---

    pub fn get_validation_status(
        e: &Env,
        request_hash: BytesN<32>,
    ) -> Result<ValidationStatus, ValidationError> {
        storage::get_validation(e, &request_hash).ok_or(ValidationError::RequestNotFound)
    }

    pub fn request_exists(e: &Env, request_hash: BytesN<32>) -> bool {
        storage::has_validation(e, &request_hash)
    }

    /// Averages answered validations of `agent_id`. With `validator_addresses`
    /// (at most 5, duplicates ignored) it reads each validator's 32 most recent
    /// answers for the agent; with an empty list, the agent's 32 most recent
    /// answers from any validator. The tag filter applies inside that window.
    /// Requests nobody answers never enter it, but the owner chooses which
    /// validators to ask: by filing many requests to one validator (routine
    /// checks under another tag, say) the owner can push that validator's
    /// older answer out of a tag-filtered view, and validators the owner picks
    /// can fill the unfiltered view. Answers count in the order of their first
    /// v2 response. Answers given under v1 count only once their validator
    /// updates them under v2. Summarize larger histories off-chain.
    pub fn get_summary(
        e: &Env,
        agent_id: u32,
        validator_addresses: Vec<Address>,
        tag: String,
    ) -> Result<ValidationSummary, ValidationError> {
        if validator_addresses.len() > MAX_SUMMARY_VALIDATORS {
            return Err(ValidationError::TooManyValidators);
        }
        let mut hashes = Vec::new(e);
        if validator_addresses.is_empty() {
            hashes = storage::recent_answered(e, agent_id, None, MAX_SUMMARY_VALIDATIONS);
        } else {
            for (i, validator) in validator_addresses.iter().enumerate() {
                if validator_addresses.first_index_of(&validator) != Some(i as u32) {
                    continue;
                }
                hashes.append(&storage::recent_answered(
                    e,
                    agent_id,
                    Some(&validator),
                    MAX_SUMMARY_VALIDATIONS,
                ));
            }
        }

        let mut total_response = 0u64;
        let mut match_count = 0u64;
        for hash in hashes.iter() {
            if let Some(status) = storage::get_validation(e, &hash) {
                if !tag.is_empty() && status.tag != tag {
                    continue;
                }
                total_response += status.response as u64;
                match_count += 1;
            }
        }

        // Integer division (50 not 50.5); use raw responses for precision.
        Ok(ValidationSummary {
            count: match_count,
            average_response: total_response.checked_div(match_count).unwrap_or(0) as u32,
        })
    }

    pub fn get_agent_validations_paginated(
        e: &Env,
        agent_id: u32,
        start: u32,
        limit: u32,
    ) -> Vec<BytesN<32>> {
        storage::get_agent_validations_paginated(e, agent_id, start, limit)
    }

    pub fn get_validator_requests_paginated(
        e: &Env,
        validator_address: Address,
        start: u32,
        limit: u32,
    ) -> Vec<BytesN<32>> {
        storage::get_validator_requests_paginated(e, &validator_address, start, limit)
    }

    pub fn get_identity_registry(e: &Env) -> Address {
        storage::get_identity_registry(e)
    }

    // --- TTL ---

    pub fn extend_ttl(e: &Env) {
        storage::extend_instance_ttl(e);
    }

    // --- Timelocked upgrade ---

    #[only_owner]
    pub fn propose_upgrade(e: &Env, new_wasm_hash: BytesN<32>) -> Result<(), ValidationError> {
        if storage::get_pending_upgrade(e).is_some() {
            return Err(ValidationError::UpgradeAlreadyProposed);
        }
        let proposed_at = e.ledger().sequence();
        storage::set_pending_upgrade(
            e,
            &storage::UpgradeProposal {
                wasm_hash: new_wasm_hash.clone(),
                proposed_at,
            },
        );
        events::UpgradeProposed {
            wasm_hash: new_wasm_hash,
            executable_at: proposed_at.saturating_add(storage::TIMELOCK_LEDGERS),
        }
        .publish(e);
        Ok(())
    }

    #[only_owner]
    pub fn cancel_upgrade(e: &Env) -> Result<(), ValidationError> {
        let proposal = storage::get_pending_upgrade(e).ok_or(ValidationError::NoUpgradeProposed)?;
        storage::remove_pending_upgrade(e);
        events::UpgradeCancelled {
            wasm_hash: proposal.wasm_hash,
        }
        .publish(e);
        Ok(())
    }

    #[only_owner]
    pub fn execute_upgrade(e: &Env) -> Result<(), ValidationError> {
        let proposal = storage::get_pending_upgrade(e).ok_or(ValidationError::NoUpgradeProposed)?;
        let elapsed = e.ledger().sequence().saturating_sub(proposal.proposed_at);
        if elapsed < storage::TIMELOCK_LEDGERS {
            return Err(ValidationError::TimelockNotExpired);
        }
        storage::remove_pending_upgrade(e);
        events::UpgradeExecuted {
            wasm_hash: proposal.wasm_hash.clone(),
        }
        .publish(e);
        e.deployer()
            .update_current_contract_wasm(proposal.wasm_hash);
        Ok(())
    }

    pub fn pending_upgrade(e: &Env) -> Option<storage::UpgradeProposal> {
        storage::get_pending_upgrade(e)
    }

    pub fn version(e: &Env) -> String {
        String::from_str(e, "0.2.0")
    }
}

#[contractimpl(contracttrait)]
impl Ownable for ValidationRegistryContract {
    /// Disabled: without an owner the contract could never be upgraded again.
    /// Hand ownership over with `transfer_ownership` and `accept_ownership`.
    fn renounce_ownership(e: &Env) {
        panic_with_error!(e, ValidationError::RenounceDisabled);
    }
}
