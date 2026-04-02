use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};

use crate::types::ValidationStatus;

pub const TTL_THRESHOLD: u32 = 518_400;
pub const TTL_BUMP: u32 = 1_036_800;

pub fn extend_instance_ttl(e: &Env) {
    e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    IdentityRegistry,
    Validation(BytesN<32>),
    AgentValidationCount(u32),
    AgentValidationAt(u32, u32),
    ValidatorRequestCount(Address),
    ValidatorRequestAt(Address, u32),
}

// --- Identity Registry ---

pub fn set_identity_registry(e: &Env, addr: &Address) {
    e.storage().instance().set(&DataKey::IdentityRegistry, addr);
}

pub fn get_identity_registry(e: &Env) -> Address {
    e.storage()
        .instance()
        .get(&DataKey::IdentityRegistry)
        .expect("identity registry not set")
}

// --- Validation ---

pub fn has_validation(e: &Env, request_hash: &BytesN<32>) -> bool {
    e.storage()
        .persistent()
        .has(&DataKey::Validation(request_hash.clone()))
}

pub fn set_validation(e: &Env, request_hash: &BytesN<32>, status: &ValidationStatus) {
    e.storage()
        .persistent()
        .set(&DataKey::Validation(request_hash.clone()), status);
}

pub fn get_validation(e: &Env, request_hash: &BytesN<32>) -> Option<ValidationStatus> {
    e.storage()
        .persistent()
        .get(&DataKey::Validation(request_hash.clone()))
}

// --- Agent Validations (indexed) ---

pub fn get_agent_validation_count(e: &Env, agent_id: u32) -> u32 {
    e.storage()
        .persistent()
        .get(&DataKey::AgentValidationCount(agent_id))
        .unwrap_or(0)
}

pub fn add_agent_validation(e: &Env, agent_id: u32, request_hash: &BytesN<32>) {
    let count = get_agent_validation_count(e, agent_id);
    e.storage()
        .persistent()
        .set(&DataKey::AgentValidationAt(agent_id, count), request_hash);
    e.storage()
        .persistent()
        .set(&DataKey::AgentValidationCount(agent_id), &(count + 1));
}

pub fn get_agent_validation_at(e: &Env, agent_id: u32, index: u32) -> Option<BytesN<32>> {
    e.storage()
        .persistent()
        .get(&DataKey::AgentValidationAt(agent_id, index))
}

pub fn get_agent_validations_paginated(
    e: &Env,
    agent_id: u32,
    start: u32,
    limit: u32,
) -> Vec<BytesN<32>> {
    let count = get_agent_validation_count(e, agent_id);
    let mut result = Vec::new(e);
    let end = core::cmp::min(start + limit, count);
    for i in start..end {
        if let Some(hash) = get_agent_validation_at(e, agent_id, i) {
            result.push_back(hash);
        }
    }
    result
}

// --- Validator Requests (indexed) ---

fn get_validator_request_count(e: &Env, validator: &Address) -> u32 {
    e.storage()
        .persistent()
        .get(&DataKey::ValidatorRequestCount(validator.clone()))
        .unwrap_or(0)
}

pub fn add_validator_request(e: &Env, validator: &Address, request_hash: &BytesN<32>) {
    let count = get_validator_request_count(e, validator);
    e.storage().persistent().set(
        &DataKey::ValidatorRequestAt(validator.clone(), count),
        request_hash,
    );
    e.storage()
        .persistent()
        .set(&DataKey::ValidatorRequestCount(validator.clone()), &(count + 1));
}

pub fn get_validator_requests_paginated(
    e: &Env,
    validator: &Address,
    start: u32,
    limit: u32,
) -> Vec<BytesN<32>> {
    let count = get_validator_request_count(e, validator);
    let mut result = Vec::new(e);
    let end = core::cmp::min(start + limit, count);
    for i in start..end {
        if let Some(hash) = e
            .storage()
            .persistent()
            .get::<_, BytesN<32>>(&DataKey::ValidatorRequestAt(validator.clone(), i))
        {
            result.push_back(hash);
        }
    }
    result
}
