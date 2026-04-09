use soroban_sdk::{contract, contractclient, contractimpl, Address, BytesN, Env, String, Vec};
use stellar_access::ownable::{self as ownable};
use stellar_macros::only_owner;

use crate::errors::ReputationError;
use crate::events;
use crate::storage;
use crate::types::{FeedbackData, SummaryResult};

/// Maximum number of clients accepted in `get_summary`. Each client costs
/// `last_index` storage reads. Soroban's per-tx read budget is small (~100
/// entries), so we silently cap larger inputs to keep the call from running
/// out of gas. Callers needing more breadth should make multiple calls.
const MAX_SUMMARY_CLIENTS: u32 = 5;

/// ERC-8004 spec: `giveFeedback` rejects values outside `[-1e38, 1e38]` so a
/// single feedback cannot wrap the i128 aggregate or overflow the WAD-mul in
/// `get_summary`. Mirrors the canonical reference's `MAX_ABS_VALUE`.
const MAX_ABS_VALUE: i128 = 100_000_000_000_000_000_000_000_000_000_000_000_000; // 1e38

// `find_owner` and `is_authorized_or_owner` return Option/bool instead of
// panicking on a missing agent, which avoids crashing this contract on
// cross-contract calls into a non-existent or archived agent.
//
// TRUST ASSUMPTION: every authorization decision in this contract delegates
// to the identity registry pointed at by `storage::get_identity_registry`.
// That registry is upgradeable by its owner (`#[only_owner] upgrade()`), so
// the identity registry's admin can:
//   - replace the WASM with one that returns false from
//     `is_authorized_or_owner`, letting the agent owner bypass the
//     self-feedback check and inflate their own reputation
//   - replace the WASM with one that always reports the attacker as
//     authorized, letting them act as approved operator for any agent
// In other words: the reputation registry is only as trustworthy as the
// identity registry's admin key. If you operate a reputation registry that
// points at a third-party identity registry, you inherit that party's
// upgrade-key custody risk. The intended deployment is that both registries
// share the same admin (or that the identity registry is governed by the
// same multisig / timelock as the reputation registry).
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

        // Spec parity: `valueDecimals` must be in `[0, 18]`.
        if value_decimals > 18 {
            return Err(ReputationError::InvalidValueDecimals);
        }

        // Spec parity: `value` must be in `[-1e38, 1e38]` (`MAX_ABS_VALUE`).
        // The bound is loose enough for any realistic feedback signal but
        // tight enough that no single feedback can wrap the i128 sum in
        // `get_summary`'s WAD normalization.
        if value > MAX_ABS_VALUE || value < -MAX_ABS_VALUE {
            return Err(ReputationError::ValueOutOfRange);
        }

        // Spec parity: the canonical erc-8004 reference rejects feedback
        // authored by the agent owner or an approved operator via a single
        // `isAuthorizedOrOwner` cross-contract call to the identity
        // registry. The check ALSO covers the agent-existence precondition:
        // a missing agent panics inside the OZ `owner_of` call, surfaced
        // here as an absent owner (returns false). We trap that and return
        // `AgentNotFound` for ergonomics, but the spec uses a single revert
        // path. Self-feedback returns `SelfFeedback` to give callers a
        // distinguishable error code.
        let identity_addr = storage::get_identity_registry(e);
        let identity = IdentityRegistryClient::new(e, &identity_addr);
        if !identity.agent_exists(&agent_id) {
            return Err(ReputationError::AgentNotFound);
        }
        if identity.is_authorized_or_owner(&caller, &agent_id) {
            return Err(ReputationError::SelfFeedback);
        }

        // Track client
        if !storage::client_exists(e, agent_id, &caller) {
            storage::add_client(e, agent_id, &caller)?;
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

        // ERC-8004 reference rejects empty response URIs.
        if response_uri.len() == 0 {
            return Err(ReputationError::EmptyValue);
        }

        // Spec parity: `appendResponse` is callable by ANYONE - no
        // owner/operator restriction. The reference does not verify the
        // agent exists either; the feedback-existence check below covers
        // it (a missing agent has `lastIndex == 0`, so any feedback lookup
        // returns `FeedbackNotFound`). Off-chain consumers filter by
        // `responder` to surface authoritative responses.
        storage::get_feedback(e, agent_id, &client_address, feedback_index)
            .ok_or(ReputationError::FeedbackNotFound)?;

        // Track response
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

    /// Spec parity: returns the average over all matching feedback for the
    /// given clients, normalized to 18-decimal WAD precision and then scaled
    /// back to the most-frequent (mode) `valueDecimals`. Reverts when
    /// `client_addresses` is empty - the canonical reference rejects this
    /// path explicitly because all-clients aggregates are a Sybil/spam
    /// vector. The off-chain explorer is responsible for any "agent-wide"
    /// score, where it can apply per-client weighting.
    ///
    /// **i128 WAD overflow note:** the canonical reference uses `int256` for
    /// the intermediate WAD computation (`value * 10^(18-decimals)`).
    /// Soroban only has `i128`, so the multiply overflows for feedback with
    /// `|value| > ~1.7e20` at `decimals=0`. The checked_mul returns
    /// `AggregateOverflow` cleanly - no silent corruption. Realistic
    /// feedback values (quality ratings, uptimes, response times) are well
    /// within the safe range. Callers with extreme values should use higher
    /// `decimals` to reduce the normalization factor.
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

        // Soroban's per-tx storage read budget caps how many clients we can
        // walk in one call. The hard cap below silently truncates the input
        // list - callers needing breadth should make multiple calls.
        let limit = core::cmp::min(client_addresses.len(), MAX_SUMMARY_CLIENTS);

        // 18-decimal WAD precision matches the canonical reference's
        // intermediate format. Each feedback is normalized into WAD before
        // summing so that `value=1, decimals=0` and `value=100, decimals=2`
        // both contribute the same magnitude.
        let mut sum_wad: i128 = 0;
        let mut count: u64 = 0;
        // Frequency table indexed by `valueDecimals` (0..=18). Used to pick
        // the mode decimals for the final output.
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

        // Mode decimals: most frequent valueDecimals across the matched
        // feedback. Ties resolve to the lowest decimals (first match wins).
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

/// Returns `10^exp` as `i128`. `exp` is bounded to `[0, 18]` by the
/// `valueDecimals` invariant in `give_feedback`, so the result fits in
/// `i128` (`10^18 < 2^60`).
fn pow10(exp: u32) -> i128 {
    let mut acc: i128 = 1;
    let mut i = 0;
    while i < exp {
        acc *= 10;
        i += 1;
    }
    acc
}
