use soroban_sdk::{contracttype, Address, Env, Vec};

use crate::errors::ReputationError;
use crate::types::{FeedbackData, SummaryResult};

pub const TTL_THRESHOLD: u32 = 518_400;
pub const TTL_BUMP: u32 = 1_036_800;

pub fn extend_instance_ttl(e: &Env) {
    e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    IdentityRegistry,
    Feedback(u32, Address, u64),
    LastIndex(u32, Address),
    ClientCount(u32),
    ClientAtIndex(u32, u32),
    ClientExists(u32, Address),
    ResponseCount(u32, Address, u64),
    AgentAggregate(u32),
    AgentTagAggregate(u32, soroban_sdk::String, soroban_sdk::String),
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

// --- Feedback ---

pub fn set_feedback(e: &Env, agent_id: u32, client: &Address, index: u64, data: &FeedbackData) {
    let key = DataKey::Feedback(agent_id, client.clone(), index);
    e.storage().persistent().set(&key, data);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
}

pub fn get_feedback(e: &Env, agent_id: u32, client: &Address, index: u64) -> Option<FeedbackData> {
    let key = DataKey::Feedback(agent_id, client.clone(), index);
    let data = e.storage().persistent().get(&key);
    if data.is_some() {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    }
    data
}

// --- Last Index ---

pub fn set_last_index(e: &Env, agent_id: u32, client: &Address, index: u64) {
    let key = DataKey::LastIndex(agent_id, client.clone());
    e.storage().persistent().set(&key, &index);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
}

pub fn get_last_index(e: &Env, agent_id: u32, client: &Address) -> u64 {
    let key = DataKey::LastIndex(agent_id, client.clone());
    if let Some(idx) = e.storage().persistent().get::<_, u64>(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
        idx
    } else {
        0
    }
}

// --- Client tracking (indexed pattern) ---

pub fn client_exists(e: &Env, agent_id: u32, client: &Address) -> bool {
    let key = DataKey::ClientExists(agent_id, client.clone());
    if e.storage().persistent().has(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
        true
    } else {
        false
    }
}

pub fn add_client(e: &Env, agent_id: u32, client: &Address) {
    let count = get_client_count(e, agent_id);
    let at_key = DataKey::ClientAtIndex(agent_id, count);
    e.storage().persistent().set(&at_key, client);
    e.storage()
        .persistent()
        .extend_ttl(&at_key, TTL_THRESHOLD, TTL_BUMP);

    let exists_key = DataKey::ClientExists(agent_id, client.clone());
    e.storage().persistent().set(&exists_key, &true);
    e.storage()
        .persistent()
        .extend_ttl(&exists_key, TTL_THRESHOLD, TTL_BUMP);

    let count_key = DataKey::ClientCount(agent_id);
    e.storage().persistent().set(&count_key, &(count + 1));
    e.storage()
        .persistent()
        .extend_ttl(&count_key, TTL_THRESHOLD, TTL_BUMP);
}

fn get_client_count(e: &Env, agent_id: u32) -> u32 {
    let key = DataKey::ClientCount(agent_id);
    if let Some(count) = e.storage().persistent().get::<_, u32>(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
        count
    } else {
        0
    }
}

pub fn get_clients_paginated(e: &Env, agent_id: u32, start: u32, limit: u32) -> Vec<Address> {
    let count = get_client_count(e, agent_id);
    let mut result = Vec::new(e);
    let end = core::cmp::min(start.saturating_add(limit), count);
    for i in start..end {
        let key = DataKey::ClientAtIndex(agent_id, i);
        if let Some(addr) = e.storage().persistent().get::<_, Address>(&key) {
            e.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
            result.push_back(addr);
        }
    }
    result
}

// --- Response Count ---

pub fn get_response_count(e: &Env, agent_id: u32, client: &Address, feedback_index: u64) -> u32 {
    let key = DataKey::ResponseCount(agent_id, client.clone(), feedback_index);
    if let Some(count) = e.storage().persistent().get::<_, u32>(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
        count
    } else {
        0
    }
}

pub fn increment_response_count(e: &Env, agent_id: u32, client: &Address, feedback_index: u64) {
    let count = get_response_count(e, agent_id, client, feedback_index);
    let key = DataKey::ResponseCount(agent_id, client.clone(), feedback_index);
    e.storage().persistent().set(&key, &(count + 1));
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
}

// --- Aggregates ---

pub fn get_aggregate(e: &Env, agent_id: u32) -> SummaryResult {
    let key = DataKey::AgentAggregate(agent_id);
    if let Some(agg) = e.storage().persistent().get::<_, SummaryResult>(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
        agg
    } else {
        SummaryResult {
            count: 0,
            summary_value: 0,
            summary_value_decimals: 0,
        }
    }
}

pub fn update_aggregate_add(
    e: &Env,
    agent_id: u32,
    value: i128,
    decimals: u32,
) -> Result<(), ReputationError> {
    let mut agg = get_aggregate(e, agent_id);
    agg.count = agg
        .count
        .checked_add(1)
        .ok_or(ReputationError::AggregateOverflow)?;
    agg.summary_value = agg
        .summary_value
        .checked_add(value)
        .ok_or(ReputationError::AggregateOverflow)?;
    if decimals > agg.summary_value_decimals {
        agg.summary_value_decimals = decimals;
    }
    let key = DataKey::AgentAggregate(agent_id);
    e.storage().persistent().set(&key, &agg);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    Ok(())
}

pub fn update_aggregate_sub(
    e: &Env,
    agent_id: u32,
    value: i128,
    _decimals: u32,
) -> Result<(), ReputationError> {
    let mut agg = get_aggregate(e, agent_id);
    if agg.count > 0 {
        agg.count -= 1;
        agg.summary_value = agg
            .summary_value
            .checked_sub(value)
            .ok_or(ReputationError::AggregateOverflow)?;
    }
    let key = DataKey::AgentAggregate(agent_id);
    e.storage().persistent().set(&key, &agg);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    Ok(())
}

pub fn get_tag_aggregate(
    e: &Env,
    agent_id: u32,
    tag1: &soroban_sdk::String,
    tag2: &soroban_sdk::String,
) -> SummaryResult {
    let key = DataKey::AgentTagAggregate(agent_id, tag1.clone(), tag2.clone());
    if let Some(agg) = e.storage().persistent().get::<_, SummaryResult>(&key) {
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
        agg
    } else {
        SummaryResult {
            count: 0,
            summary_value: 0,
            summary_value_decimals: 0,
        }
    }
}

pub fn update_tag_aggregate_add(
    e: &Env,
    agent_id: u32,
    tag1: &soroban_sdk::String,
    tag2: &soroban_sdk::String,
    value: i128,
    decimals: u32,
) -> Result<(), ReputationError> {
    let mut agg = get_tag_aggregate(e, agent_id, tag1, tag2);
    agg.count = agg
        .count
        .checked_add(1)
        .ok_or(ReputationError::AggregateOverflow)?;
    agg.summary_value = agg
        .summary_value
        .checked_add(value)
        .ok_or(ReputationError::AggregateOverflow)?;
    if decimals > agg.summary_value_decimals {
        agg.summary_value_decimals = decimals;
    }
    let key = DataKey::AgentTagAggregate(agent_id, tag1.clone(), tag2.clone());
    e.storage().persistent().set(&key, &agg);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    Ok(())
}

pub fn update_tag_aggregate_sub(
    e: &Env,
    agent_id: u32,
    tag1: &soroban_sdk::String,
    tag2: &soroban_sdk::String,
    value: i128,
    _decimals: u32,
) -> Result<(), ReputationError> {
    let mut agg = get_tag_aggregate(e, agent_id, tag1, tag2);
    if agg.count > 0 {
        agg.count -= 1;
        agg.summary_value = agg
            .summary_value
            .checked_sub(value)
            .ok_or(ReputationError::AggregateOverflow)?;
    }
    let key = DataKey::AgentTagAggregate(agent_id, tag1.clone(), tag2.clone());
    e.storage().persistent().set(&key, &agg);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_BUMP);
    Ok(())
}
