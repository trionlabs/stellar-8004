use soroban_sdk::{contract, contractclient, contractimpl, Address, BytesN, Env, String, Vec};
use stellar_access::ownable::{self as ownable};
use stellar_macros::only_owner;

use crate::errors::ReputationError;
use crate::events;
use crate::storage;
use crate::types::{FeedbackData, SummaryResult};

// Minimal client for the Identity Registry - only the functions we need
#[contractclient(name = "IdentityRegistryClient")]
pub trait IdentityRegistryInterface {
    fn owner_of(e: &Env, token_id: u32) -> Address;
    fn get_approved(e: &Env, token_id: u32) -> Option<Address>;
    fn is_approved_for_all(e: &Env, owner: Address, operator: Address) -> bool;
}

#[contract]
pub struct ReputationRegistryContract;

#[contractimpl]
impl ReputationRegistryContract {
    pub fn __constructor(e: &Env, owner: Address, identity_registry: Address) {
        ownable::set_owner(e, &owner);
        storage::set_identity_registry(e, &identity_registry);
    }

    pub fn give_feedback(
        e: &Env,
        caller: Address,
        agent_id: u32,
        value: i128,
        value_decimals: u32,
        tag1: String,
        tag2: String,
        endpoint: String,
        feedback_uri: String,
        feedback_hash: BytesN<32>,
    ) -> Result<(), ReputationError> {
        caller.require_auth();

        if value_decimals > 18 {
            return Err(ReputationError::InvalidValueDecimals);
        }

        // Prevent self-feedback: caller must not be owner, approved, or operator
        let identity_addr = storage::get_identity_registry(e);
        let identity = IdentityRegistryClient::new(e, &identity_addr);
        let owner = identity.owner_of(&agent_id);
        if caller == owner {
            return Err(ReputationError::SelfFeedback);
        }
        if let Some(approved) = identity.get_approved(&agent_id) {
            if caller == approved {
                return Err(ReputationError::SelfFeedback);
            }
        }
        if identity.is_approved_for_all(&owner, &caller) {
            return Err(ReputationError::SelfFeedback);
        }

        // Track client
        if !storage::client_exists(e, agent_id, &caller) {
            storage::add_client(e, agent_id, &caller);
        }

        // Increment feedback index
        let feedback_index = storage::get_last_index(e, agent_id, &caller) + 1;
        storage::set_last_index(e, agent_id, &caller, feedback_index);

        // Store feedback data (on-chain portion)
        let data = FeedbackData {
            value,
            value_decimals,
            is_revoked: false,
            tag1: tag1.clone(),
            tag2: tag2.clone(),
        };
        storage::set_feedback(e, agent_id, &caller, feedback_index, &data);

        // Update running aggregate
        storage::update_aggregate_add(e, agent_id, value, value_decimals)?;
        storage::update_tag_aggregate_add(e, agent_id, &tag1, &tag2, value, value_decimals)?;

        // Emit event with full data (including off-chain fields)
        events::new_feedback(
            e,
            agent_id,
            &caller,
            feedback_index,
            value,
            value_decimals,
            &tag1,
            &tag2,
            &endpoint,
            &feedback_uri,
            &feedback_hash,
        );

        Ok(())
    }

    pub fn revoke_feedback(
        e: &Env,
        caller: Address,
        agent_id: u32,
        feedback_index: u64,
    ) -> Result<(), ReputationError> {
        caller.require_auth();

        let mut data = storage::get_feedback(e, agent_id, &caller, feedback_index)
            .ok_or(ReputationError::FeedbackNotFound)?;

        if data.is_revoked {
            return Err(ReputationError::FeedbackNotFound);
        }

        // Subtract from aggregate before revoking
        storage::update_aggregate_sub(e, agent_id, data.value, data.value_decimals)?;
        storage::update_tag_aggregate_sub(
            e,
            agent_id,
            &data.tag1,
            &data.tag2,
            data.value,
            data.value_decimals,
        )?;

        data.is_revoked = true;
        storage::set_feedback(e, agent_id, &caller, feedback_index, &data);

        events::feedback_revoked(e, agent_id, &caller, feedback_index);

        Ok(())
    }

    pub fn append_response(
        e: &Env,
        caller: Address,
        agent_id: u32,
        client_address: Address,
        feedback_index: u64,
        response_uri: String,
        response_hash: BytesN<32>,
    ) -> Result<(), ReputationError> {
        caller.require_auth();

        // Only agent owner, approved, or approved-for-all can respond
        let identity_addr = storage::get_identity_registry(e);
        let identity = IdentityRegistryClient::new(e, &identity_addr);
        let owner = identity.owner_of(&agent_id);
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
                return Err(ReputationError::NotOwnerOrApproved);
            }
        }

        // Verify feedback exists
        storage::get_feedback(e, agent_id, &client_address, feedback_index)
            .ok_or(ReputationError::FeedbackNotFound)?;

        // Track response
        storage::increment_response_count(e, agent_id, &client_address, feedback_index);

        events::response_appended(
            e,
            agent_id,
            &client_address,
            &caller,
            feedback_index,
            &response_uri,
            &response_hash,
        );

        Ok(())
    }

    // --- Read functions ---

    pub fn read_feedback(
        e: &Env,
        agent_id: u32,
        client_address: Address,
        feedback_index: u64,
    ) -> Result<FeedbackData, ReputationError> {
        storage::get_feedback(e, agent_id, &client_address, feedback_index)
            .ok_or(ReputationError::FeedbackNotFound)
    }

    pub fn get_summary(
        e: &Env,
        agent_id: u32,
        client_addresses: Vec<Address>,
        tag1: String,
        tag2: String,
    ) -> SummaryResult {
        if client_addresses.is_empty() {
            // Use pre-computed aggregate
            let has_tags = tag1.len() > 0 || tag2.len() > 0;
            if has_tags {
                storage::get_tag_aggregate(e, agent_id, &tag1, &tag2)
            } else {
                storage::get_aggregate(e, agent_id)
            }
        } else {
            // Compute on-the-fly for specific clients
            let mut count = 0u64;
            let mut sum = 0i128;
            let mut max_dec = 0u32;

            for client in client_addresses.iter() {
                let last = storage::get_last_index(e, agent_id, &client);
                for i in 1..=last {
                    if let Some(fb) = storage::get_feedback(e, agent_id, &client, i) {
                        if fb.is_revoked {
                            continue;
                        }
                        let tag_match = (tag1.len() == 0 || fb.tag1 == tag1)
                            && (tag2.len() == 0 || fb.tag2 == tag2);
                        if tag_match {
                            count = count.saturating_add(1);
                            // Saturating: this path returns SummaryResult directly (no Result),
                            // so we clamp instead of erroring. Persistent aggregates above use
                            // checked arithmetic and surface AggregateOverflow.
                            sum = sum.saturating_add(fb.value);
                            if fb.value_decimals > max_dec {
                                max_dec = fb.value_decimals;
                            }
                        }
                    }
                }
            }

            SummaryResult {
                count,
                summary_value: sum,
                summary_value_decimals: max_dec,
            }
        }
    }

    pub fn get_clients_paginated(e: &Env, agent_id: u32, start: u32, limit: u32) -> Vec<Address> {
        storage::get_clients_paginated(e, agent_id, start, limit)
    }

    pub fn get_last_index(e: &Env, agent_id: u32, client_address: Address) -> u64 {
        storage::get_last_index(e, agent_id, &client_address)
    }

    pub fn get_response_count(
        e: &Env,
        agent_id: u32,
        client_address: Address,
        feedback_index: u64,
    ) -> u32 {
        storage::get_response_count(e, agent_id, &client_address, feedback_index)
    }

    pub fn get_identity_registry(e: &Env) -> Address {
        storage::get_identity_registry(e)
    }

    // --- TTL ---

    pub fn extend_ttl(e: &Env) {
        storage::extend_instance_ttl(e);
    }

    // --- Admin ---

    #[only_owner]
    pub fn upgrade(e: &Env, new_wasm_hash: BytesN<32>) {
        e.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn version(e: &Env) -> String {
        String::from_str(e, "0.1.0")
    }
}
