use soroban_sdk::{contract, contractclient, contractimpl, Address, BytesN, Env, String, Vec};
use stellar_access::ownable::{self as ownable};
use stellar_macros::only_owner;

use crate::errors::ReputationError;
use crate::events;
use crate::storage;
use crate::types::{FeedbackData, SummaryResult};

const MAX_SUMMARY_CLIENTS: u32 = 5;
const MAX_ABS_VALUE: i128 = 100_000_000_000_000_000_000_000_000_000_000_000_000; // 1e38

// Cross-contract auth delegates to identity registry; trust its admin.
#[contractclient(name = "IdentityRegistryClient")]
pub trait IdentityRegistryInterface {
    fn find_owner(e: &Env, agent_id: u32) -> Option<Address>;
    fn agent_exists(e: &Env, agent_id: u32) -> bool;
    fn is_authorized_or_owner(e: &Env, spender: Address, agent_id: u32) -> bool;
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
        if value > MAX_ABS_VALUE || value < -MAX_ABS_VALUE {
            return Err(ReputationError::ValueOutOfRange);
        }

        let identity_addr = storage::get_identity_registry(e);
        let identity = IdentityRegistryClient::new(e, &identity_addr);
        if !identity.agent_exists(&agent_id) {
            return Err(ReputationError::AgentNotFound);
        }
        if identity.is_authorized_or_owner(&caller, &agent_id) {
            return Err(ReputationError::SelfFeedback);
        }

        if !storage::client_exists(e, agent_id, &caller) {
            storage::add_client(e, agent_id, &caller)?;
        }

        let feedback_index = storage::get_last_index(e, agent_id, &caller) + 1;
        storage::set_last_index(e, agent_id, &caller, feedback_index);

        let data = FeedbackData {
            value,
            value_decimals,
            is_revoked: false,
            tag1: tag1.clone(),
            tag2: tag2.clone(),
        };
        storage::set_feedback(e, agent_id, &caller, feedback_index, &data);

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

        data.is_revoked = true;
        storage::set_feedback(e, agent_id, &caller, feedback_index, &data);

        events::feedback_revoked(e, agent_id, &caller, feedback_index);

        Ok(())
    }

    /// Callable by anyone.
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

        if response_uri.len() == 0 {
            return Err(ReputationError::EmptyValue);
        }

        storage::get_feedback(e, agent_id, &client_address, feedback_index)
            .ok_or(ReputationError::FeedbackNotFound)?;

        storage::increment_response_count(e, agent_id, &client_address, feedback_index)?;

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

    /// WAD-normalized average for given clients. Rejects empty client list.
    /// i128 WAD overflow at |value| > ~1.7e20 with decimals=0 returns AggregateOverflow.
    pub fn get_summary(
        e: &Env,
        agent_id: u32,
        client_addresses: Vec<Address>,
        tag1: String,
        tag2: String,
    ) -> Result<SummaryResult, ReputationError> {
        if client_addresses.is_empty() {
            return Err(ReputationError::ClientAddressesRequired);
        }

        let limit = core::cmp::min(client_addresses.len(), MAX_SUMMARY_CLIENTS);
        let mut sum_wad: i128 = 0;
        let mut count: u64 = 0;
        let mut decimal_counts = [0u64; 19];

        for idx in 0..limit {
            let client = client_addresses.get(idx).unwrap();
            let last = storage::get_last_index(e, agent_id, &client);
            for i in 1..=last {
                if let Some(fb) = storage::get_feedback(e, agent_id, &client, i) {
                    if fb.is_revoked {
                        continue;
                    }
                    if tag1.len() != 0 && fb.tag1 != tag1 {
                        continue;
                    }
                    if tag2.len() != 0 && fb.tag2 != tag2 {
                        continue;
                    }
                    let dec = if fb.value_decimals > 18 {
                        18
                    } else {
                        fb.value_decimals
                    };
                    let factor = pow10(18 - dec);
                    let normalized = fb
                        .value
                        .checked_mul(factor)
                        .ok_or(ReputationError::AggregateOverflow)?;
                    sum_wad = sum_wad
                        .checked_add(normalized)
                        .ok_or(ReputationError::AggregateOverflow)?;
                    decimal_counts[dec as usize] += 1;
                    count = count
                        .checked_add(1)
                        .ok_or(ReputationError::AggregateOverflow)?;
                }
            }
        }

        if count == 0 {
            return Ok(SummaryResult {
                count: 0,
                summary_value: 0,
                summary_value_decimals: 0,
            });
        }

        // Mode decimals (ties resolve to lowest).
        let mut mode_dec: u32 = 0;
        let mut max_freq: u64 = 0;
        for d in 0u32..=18 {
            let freq = decimal_counts[d as usize];
            if freq > max_freq {
                max_freq = freq;
                mode_dec = d;
            }
        }

        let avg_wad = sum_wad / (count as i128);
        let summary_value = avg_wad / pow10(18 - mode_dec);

        Ok(SummaryResult {
            count,
            summary_value,
            summary_value_decimals: mode_dec,
        })
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

const POW10: [i128; 19] = [
    1,
    10,
    100,
    1_000,
    10_000,
    100_000,
    1_000_000,
    10_000_000,
    100_000_000,
    1_000_000_000,
    10_000_000_000,
    100_000_000_000,
    1_000_000_000_000,
    10_000_000_000_000,
    100_000_000_000_000,
    1_000_000_000_000_000,
    10_000_000_000_000_000,
    100_000_000_000_000_000,
    1_000_000_000_000_000_000,
];

fn pow10(exp: u32) -> i128 {
    POW10[exp as usize]
}
