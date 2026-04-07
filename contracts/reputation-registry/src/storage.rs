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
    e.storage()
        .persistent()
        .set(&DataKey::Feedback(agent_id, client.clone(), index), data);
}

pub fn get_feedback(e: &Env, agent_id: u32, client: &Address, index: u64) -> Option<FeedbackData> {
    e.storage()
        .persistent()
        .get(&DataKey::Feedback(agent_id, client.clone(), index))
}

// --- Last Index ---

pub fn set_last_index(e: &Env, agent_id: u32, client: &Address, index: u64) {
    e.storage()
        .persistent()
        .set(&DataKey::LastIndex(agent_id, client.clone()), &index);
}

pub fn get_last_index(e: &Env, agent_id: u32, client: &Address) -> u64 {
    e.storage()
        .persistent()
        .get(&DataKey::LastIndex(agent_id, client.clone()))
        .unwrap_or(0)
}

// --- Client tracking (indexed pattern) ---

pub fn client_exists(e: &Env, agent_id: u32, client: &Address) -> bool {
    e.storage()
        .persistent()
        .has(&DataKey::ClientExists(agent_id, client.clone()))
}

pub fn add_client(e: &Env, agent_id: u32, client: &Address) {
    let count = get_client_count(e, agent_id);
    e.storage()
        .persistent()
        .set(&DataKey::ClientAtIndex(agent_id, count), client);
    e.storage()
        .persistent()
        .set(&DataKey::ClientExists(agent_id, client.clone()), &true);
    e.storage()
        .persistent()
        .set(&DataKey::ClientCount(agent_id), &(count + 1));
}

fn get_client_count(e: &Env, agent_id: u32) -> u32 {
    e.storage()
        .persistent()
        .get(&DataKey::ClientCount(agent_id))
        .unwrap_or(0)
}

pub fn get_clients_paginated(e: &Env, agent_id: u32, start: u32, limit: u32) -> Vec<Address> {
    let count = get_client_count(e, agent_id);
    let mut result = Vec::new(e);
    let end = core::cmp::min(start.saturating_add(limit), count);
    for i in start..end {
        if let Some(addr) = e
            .storage()
            .persistent()
            .get::<_, Address>(&DataKey::ClientAtIndex(agent_id, i))
        {
            result.push_back(addr);
        }
    }
    result
}

// --- Response Count ---

pub fn get_response_count(e: &Env, agent_id: u32, client: &Address, feedback_index: u64) -> u32 {
    e.storage()
        .persistent()
        .get(&DataKey::ResponseCount(
            agent_id,
            client.clone(),
            feedback_index,
        ))
        .unwrap_or(0)
}

pub fn increment_response_count(e: &Env, agent_id: u32, client: &Address, feedback_index: u64) {
    let count = get_response_count(e, agent_id, client, feedback_index);
    e.storage().persistent().set(
        &DataKey::ResponseCount(agent_id, client.clone(), feedback_index),
        &(count + 1),
    );
}

// --- Aggregates ---

pub fn get_aggregate(e: &Env, agent_id: u32) -> SummaryResult {
    e.storage()
        .persistent()
        .get(&DataKey::AgentAggregate(agent_id))
        .unwrap_or(SummaryResult {
            count: 0,
            summary_value: 0,
            summary_value_decimals: 0,
        })
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
    e.storage()
        .persistent()
        .set(&DataKey::AgentAggregate(agent_id), &agg);
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
    e.storage()
        .persistent()
        .set(&DataKey::AgentAggregate(agent_id), &agg);
    Ok(())
}

pub fn get_tag_aggregate(
    e: &Env,
    agent_id: u32,
    tag1: &soroban_sdk::String,
    tag2: &soroban_sdk::String,
) -> SummaryResult {
    e.storage()
        .persistent()
        .get(&DataKey::AgentTagAggregate(
            agent_id,
            tag1.clone(),
            tag2.clone(),
        ))
        .unwrap_or(SummaryResult {
            count: 0,
            summary_value: 0,
            summary_value_decimals: 0,
        })
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
    e.storage().persistent().set(
        &DataKey::AgentTagAggregate(agent_id, tag1.clone(), tag2.clone()),
        &agg,
    );
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
    e.storage().persistent().set(
        &DataKey::AgentTagAggregate(agent_id, tag1.clone(), tag2.clone()),
        &agg,
    );
    Ok(())
}
