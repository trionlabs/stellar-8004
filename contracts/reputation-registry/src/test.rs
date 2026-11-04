#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger as _},
    Address, BytesN, Env, String, Vec,
};

use crate::contract::{
    ReputationRegistryContract, ReputationRegistryContractClient, MAX_SUMMARY_FEEDBACK_PER_CLIENT,
    MAX_TAG_LEN,
};
use crate::errors::ReputationError;
use crate::storage::{DataKey, TTL_BUMP};
use crate::types::{FeedbackData, SummaryResult};

// Mock identity registry for cross-contract calls. Tracks owners + an
// optional "approved" address per agent so we can drive both the
// self-feedback rejection path and the operator-bypass path.
mod mock_identity {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    pub enum DataKey {
        Owner(u32),
        Approved(u32),
        Wallet(u32),
    }

    #[contract]
    pub struct MockIdentityRegistry;

    #[contractimpl]
    impl MockIdentityRegistry {
        pub fn set_owner(e: &Env, token_id: u32, owner: Address) {
            e.storage()
                .persistent()
                .set(&DataKey::Owner(token_id), &owner);
        }

        pub fn clear_owner(e: &Env, token_id: u32) {
            e.storage().persistent().remove(&DataKey::Owner(token_id));
        }

        pub fn set_approved(e: &Env, token_id: u32, operator: Address) {
            e.storage()
                .persistent()
                .set(&DataKey::Approved(token_id), &operator);
        }

        pub fn set_wallet(e: &Env, token_id: u32, wallet: Address) {
            e.storage()
                .persistent()
                .set(&DataKey::Wallet(token_id), &wallet);
        }

        pub fn get_agent_wallet(e: &Env, agent_id: u32) -> Option<Address> {
            e.storage().persistent().get(&DataKey::Wallet(agent_id))
        }

        pub fn find_owner(e: &Env, agent_id: u32) -> Option<Address> {
            e.storage().persistent().get(&DataKey::Owner(agent_id))
        }

        pub fn agent_exists(e: &Env, agent_id: u32) -> bool {
            e.storage().persistent().has(&DataKey::Owner(agent_id))
        }

        pub fn is_authorized_or_owner(e: &Env, spender: Address, agent_id: u32) -> bool {
            if let Some(owner) = e
                .storage()
                .persistent()
                .get::<_, Address>(&DataKey::Owner(agent_id))
            {
                if owner == spender {
                    return true;
                }
            } else {
                return false;
            }
            if let Some(approved) = e
                .storage()
                .persistent()
                .get::<_, Address>(&DataKey::Approved(agent_id))
            {
                if approved == spender {
                    return true;
                }
            }
            false
        }
    }
}

use mock_identity::{MockIdentityRegistry, MockIdentityRegistryClient};

fn setup(
    e: &Env,
) -> (
    ReputationRegistryContractClient<'_>,
    MockIdentityRegistryClient<'_>,
    Address,
    Address,
) {
    let agent_owner = Address::generate(e);
    let reviewer = Address::generate(e);

    // Deploy mock identity registry
    let identity_addr = e.register(MockIdentityRegistry, ());
    let identity_client = MockIdentityRegistryClient::new(e, &identity_addr);

    // Set agent 0 owner
    identity_client.set_owner(&0, &agent_owner);

    // Deploy reputation registry with admin + identity reference
    let admin = Address::generate(e);
    let rep_addr = e.register(ReputationRegistryContract, (admin, identity_addr));
    let rep_client = ReputationRegistryContractClient::new(e, &rep_addr);

    (rep_client, identity_client, agent_owner, reviewer)
}

fn empty_str(e: &Env) -> String {
    String::from_str(e, "")
}

fn zero_hash(e: &Env) -> BytesN<32> {
    BytesN::from_array(e, &[0u8; 32])
}

#[test]
fn test_give_feedback() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &85,
        &2,
        &String::from_str(&env, "quality"),
        &String::from_str(&env, "speed"),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    let fb = client.read_feedback(&0, &reviewer, &1);
    assert_eq!(fb.value, 85);
    assert_eq!(fb.value_decimals, 2);
    assert!(!fb.is_revoked);
}

#[test]
fn test_self_feedback_rejected() {
    // Owner cannot review their own agent.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, _) = setup(&env);

    let result = client.try_give_feedback(
        &agent_owner,
        &0,
        &100,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(
        result.is_err(),
        "agent owner must be rejected from give_feedback"
    );
}

#[test]
fn test_approved_operator_rejected_from_self_feedback() {
    // Approved operators can't review either.
    let env = Env::default();
    env.mock_all_auths();
    let (client, identity, _, _) = setup(&env);
    let operator = Address::generate(&env);

    identity.set_approved(&0, &operator);

    let result = client.try_give_feedback(
        &operator,
        &0,
        &100,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(
        result.is_err(),
        "approved operator must be rejected from give_feedback"
    );
}

#[test]
fn test_revoke_feedback() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &50,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    client.revoke_feedback(&reviewer, &0, &1);
    let fb = client.read_feedback(&0, &reviewer, &1);
    assert!(fb.is_revoked);
}

#[test]
fn test_get_summary_returns_average() {
    // get_summary returns the average, not the sum.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    for val in [80i128, 90, 70] {
        client.give_feedback(
            &reviewer,
            &0,
            &val,
            &0,
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &zero_hash(&env),
        );
    }

    let mut clients = Vec::<Address>::new(&env);
    clients.push_back(reviewer.clone());
    let summary = client.get_summary(&0, &clients, &empty_str(&env), &empty_str(&env));
    assert_eq!(summary.count, 3);
    assert_eq!(summary.summary_value, 80); // (80 + 90 + 70) / 3
    assert_eq!(summary.summary_value_decimals, 0);
}

#[test]
fn test_get_summary_revoked_excluded() {
    // Revoked feedback excluded from average.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &100,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    client.give_feedback(
        &reviewer,
        &0,
        &50,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    client.revoke_feedback(&reviewer, &0, &1);

    let mut clients = Vec::<Address>::new(&env);
    clients.push_back(reviewer.clone());
    let summary = client.get_summary(&0, &clients, &empty_str(&env), &empty_str(&env));
    assert_eq!(summary.count, 1);
    assert_eq!(summary.summary_value, 50);
}

#[test]
fn test_get_summary_wad_normalization_picks_mode_decimals() {
    // Mixed decimals: (80, dec=0), (90, dec=0), (10000, dec=2) = 100.
    // All normalize to 18 decimals, average = (80+90+100)/3 = 90.
    // Mode decimals = 0 (two entries), so output is 90 with decimals=0.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    let inputs: [(i128, u32); 3] = [(80, 0), (90, 0), (10_000, 2)];
    for (val, dec) in inputs {
        client.give_feedback(
            &reviewer,
            &0,
            &val,
            &dec,
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &zero_hash(&env),
        );
    }

    let mut clients = Vec::<Address>::new(&env);
    clients.push_back(reviewer.clone());
    let summary = client.get_summary(&0, &clients, &empty_str(&env), &empty_str(&env));
    assert_eq!(summary.count, 3);
    assert_eq!(summary.summary_value_decimals, 0);
    assert_eq!(summary.summary_value, 90);
}

#[test]
fn test_get_summary_rejects_empty_client_list() {
    // Empty client list must revert (Sybil prevention).
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = setup(&env);

    let result = client.try_get_summary(
        &0,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert!(
        result.is_err(),
        "get_summary with empty client list must revert"
    );
}

#[test]
fn test_client_tracking() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);
    let reviewer2 = Address::generate(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &80,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    client.give_feedback(
        &reviewer2,
        &0,
        &90,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    let clients = client.get_clients_paginated(&0, &0, &10);
    assert_eq!(clients.len(), 2);
}

#[test]
fn test_append_response() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, reviewer) = setup(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &75,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    // Agent owner responds
    client.append_response(
        &agent_owner,
        &0,
        &reviewer,
        &1,
        &String::from_str(&env, "https://response.json"),
        &zero_hash(&env),
    );

    assert_eq!(client.get_response_count(&0, &reviewer, &1), 1);
}

#[test]
fn test_version() {
    let env = Env::default();
    let (client, _, _, _) = setup(&env);
    assert_eq!(client.version(), String::from_str(&env, "0.2.0"));
}

// --- Negative tests ---

#[test]
fn test_non_submitter_cannot_revoke() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);
    let stranger = Address::generate(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &80,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    // Stranger tries to revoke reviewer's feedback
    let result = client.try_revoke_feedback(&stranger, &0, &1);
    assert!(result.is_err());
}

#[test]
fn test_anyone_can_append_response() {
    // Anyone can append a response, not just the agent owner.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);
    let stranger = Address::generate(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &75,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    client.append_response(
        &stranger,
        &0,
        &reviewer,
        &1,
        &String::from_str(&env, "https://example.com/response.json"),
        &zero_hash(&env),
    );
    assert_eq!(client.get_response_count(&0, &reviewer, &1), 1);
}

#[test]
fn test_invalid_value_decimals_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    // decimals > 18 should fail
    let result = client.try_give_feedback(
        &reviewer,
        &0,
        &100,
        &19,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(result.is_err());
}

#[test]
fn test_revoke_nonexistent_feedback_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    let result = client.try_revoke_feedback(&reviewer, &0, &999);
    assert!(result.is_err());
}

#[test]
fn test_double_revoke_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    client.give_feedback(
        &reviewer,
        &0,
        &50,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    client.revoke_feedback(&reviewer, &0, &1);
    // Second revoke should fail
    let result = client.try_revoke_feedback(&reviewer, &0, &1);
    assert!(result.is_err());
}

#[test]
fn test_timelocked_upgrade() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = setup(&env);
    let hash = soroban_sdk::BytesN::from_array(&env, &[1u8; 32]);

    client.propose_upgrade(&hash);
    assert!(client.pending_upgrade().is_some());

    // Too early
    let result = client.try_execute_upgrade();
    assert!(result.is_err());

    // Cancel instead
    client.cancel_upgrade();
    assert!(client.pending_upgrade().is_none());
}

#[test]
fn test_value_out_of_range_rejected() {
    // Values outside [-1e38, 1e38] are rejected. At 18 decimals no
    // normalization is needed, so only this flat bound applies.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    let max_abs: i128 = 100_000_000_000_000_000_000_000_000_000_000_000_000;
    assert_eq!(
        give(&client, &reviewer, max_abs + 1, 18),
        Err(Ok(ReputationError::ValueOutOfRange))
    );
    assert_eq!(
        give(&client, &reviewer, -max_abs - 1, 18),
        Err(Ok(ReputationError::ValueOutOfRange))
    );
    assert_eq!(give(&client, &reviewer, max_abs, 18), Ok(Ok(())));
    assert_eq!(give(&client, &reviewer, -max_abs, 18), Ok(Ok(())));
}

#[test]
fn test_give_feedback_on_missing_agent_returns_error_not_panic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, identity, _, reviewer) = setup(&env);

    // Wipe the agent record so identity.find_owner returns None.
    identity.clear_owner(&0);

    let result = client.try_give_feedback(
        &reviewer,
        &0,
        &50,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(
        result.is_err(),
        "give_feedback against a missing agent must return Err, not panic"
    );
}

#[test]
fn test_append_response_for_missing_feedback_returns_error_not_panic() {
    // Appending to non-existent feedback returns FeedbackNotFound.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, reviewer) = setup(&env);

    // No feedback has been written for (agent=0, client=reviewer, index=1).
    let result = client.try_append_response(
        &agent_owner,
        &0,
        &reviewer,
        &1,
        &String::from_str(&env, "https://response.json"),
        &zero_hash(&env),
    );
    assert!(
        result.is_err(),
        "append_response for a missing feedback must return Err, not panic"
    );
}

#[test]
fn test_get_summary_caps_explicit_client_list() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = setup(&env);

    // Build 7 reviewers, each with one feedback worth 10 points.
    let reviewers: std::vec::Vec<Address> = (0..7).map(|_| Address::generate(&env)).collect();
    for r in &reviewers {
        client.give_feedback(
            r,
            &0,
            &10,
            &0,
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &zero_hash(&env),
        );
    }

    // Pass all 7 to get_summary. The cap is 5, so the result must reflect
    // exactly 5 contributions - the trailing 2 are silently dropped to keep
    // storage reads bounded.
    let mut clients_arg = Vec::<Address>::new(&env);
    for r in &reviewers {
        clients_arg.push_back(r.clone());
    }
    let summary = client.get_summary(&0, &clients_arg, &empty_str(&env), &empty_str(&env));
    assert_eq!(summary.count, 5);
    // 5 contributions of (10, dec=0). Average = 10.
    assert_eq!(summary.summary_value, 10);
}

#[test]
fn test_feedback_ttl_survives_long_idle_periods_via_reads() {
    // TTL extension on reads keeps feedback entries alive across idle windows.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);
    let contract_addr = client.address.clone();

    client.give_feedback(
        &reviewer,
        &0,
        &80,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    env.as_contract(&contract_addr, || {
        let ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Feedback(0, reviewer.clone(), 1));
        assert_eq!(
            ttl, TTL_BUMP,
            "set path should extend the feedback entry TTL to TTL_BUMP"
        );
    });

    // Burn most of the TTL window.
    let advance: u32 = TTL_BUMP - 100;
    env.ledger().with_mut(|l| l.sequence_number += advance);

    // read_feedback must extend the TTL on read; the entry must survive.
    let fb = client.read_feedback(&0, &reviewer, &1);
    assert_eq!(fb.value, 80);

    env.as_contract(&contract_addr, || {
        let ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Feedback(0, reviewer.clone(), 1));
        assert_eq!(
            ttl, TTL_BUMP,
            "read_feedback should re-extend the feedback TTL to TTL_BUMP"
        );
    });
}

type GiveResult = Result<
    Result<(), soroban_sdk::ConversionError>,
    Result<ReputationError, soroban_sdk::InvokeError>,
>;

/// give_feedback on agent 0 with empty tags, URIs and hash.
fn give(
    client: &ReputationRegistryContractClient,
    reviewer: &Address,
    value: i128,
    decimals: u32,
) -> GiveResult {
    let e = &client.env;
    client.try_give_feedback(
        reviewer,
        &0,
        &value,
        &decimals,
        &empty_str(e),
        &empty_str(e),
        &empty_str(e),
        &empty_str(e),
        &zero_hash(e),
    )
}

fn summary(client: &ReputationRegistryContractClient, reviewers: &[&Address]) -> SummaryResult {
    let e = &client.env;
    let mut clients = Vec::new(e);
    for reviewer in reviewers {
        clients.push_back((*reviewer).clone());
    }
    client.get_summary(&0, &clients, &empty_str(e), &empty_str(e))
}

// Largest value that still fits i128 once normalized to 18 decimals from 0.
const MAX_AT_DECIMALS_0: i128 = i128::MAX / 1_000_000_000_000_000_000;

#[test]
fn test_renounce_ownership_is_disabled() {
    // #14: renouncing would leave no owner to run the timelocked upgrade.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = setup(&env);
    let owner = client.get_owner();
    assert!(owner.is_some());

    assert_eq!(
        client.try_renounce_ownership(),
        Err(Ok(soroban_sdk::Error::from_contract_error(
            ReputationError::RenounceDisabled as u32
        )))
    );
    assert_eq!(client.get_owner(), owner);
}

#[test]
fn test_bound_agent_wallet_rejected_from_self_feedback() {
    // C1: the agent's bound wallet is neither its owner nor an approved
    // operator, yet it must not rate its own agent.
    let env = Env::default();
    env.mock_all_auths();
    let (client, identity, _, reviewer) = setup(&env);
    let wallet = Address::generate(&env);
    identity.set_wallet(&0, &wallet);

    assert_eq!(
        give(&client, &wallet, 100, 0),
        Err(Ok(ReputationError::SelfFeedback))
    );
    // A wallet bound to another agent is still an ordinary reviewer here.
    identity.set_owner(&1, &Address::generate(&env));
    identity.set_wallet(&1, &reviewer);
    assert_eq!(give(&client, &reviewer, 80, 0), Ok(Ok(())));
}

#[test]
fn test_give_feedback_rejects_unnormalizable_value() {
    // H1/#14: inside the flat 1e38 bound, a value that overflows i128 once
    // normalized to 18 decimals used to be stored and then broke get_summary.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    assert_eq!(
        give(&client, &reviewer, MAX_AT_DECIMALS_0 + 1, 0),
        Err(Ok(ReputationError::ValueOutOfRange))
    );
    assert_eq!(
        give(&client, &reviewer, -MAX_AT_DECIMALS_0 - 1, 0),
        Err(Ok(ReputationError::ValueOutOfRange))
    );
    // The bound depends on the decimals: the same value fits at 18 decimals.
    assert_eq!(
        give(&client, &reviewer, MAX_AT_DECIMALS_0 + 1, 18),
        Ok(Ok(()))
    );
    assert_eq!(give(&client, &reviewer, MAX_AT_DECIMALS_0, 0), Ok(Ok(())));
    assert_eq!(client.get_last_index(&0, &reviewer), 2);
}

#[test]
fn test_get_summary_skips_unnormalizable_legacy_entry() {
    // H1, read side: an entry stored before the write check that cannot be
    // normalized is skipped instead of failing the whole summary.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    env.as_contract(&client.address, || {
        for (index, value) in [(1u64, i128::MAX), (2, 50)] {
            crate::storage::set_feedback(
                &env,
                0,
                &reviewer,
                index,
                &FeedbackData {
                    value,
                    value_decimals: 0,
                    is_revoked: false,
                    tag1: empty_str(&env),
                    tag2: empty_str(&env),
                },
            );
        }
        crate::storage::set_last_index(&env, 0, &reviewer, 2);
    });

    let result = summary(&client, &[&reviewer]);
    assert_eq!(result.count, 1);
    assert_eq!(result.summary_value, 50);
}

#[test]
fn test_get_summary_sum_cannot_overflow() {
    // Two values at the normalization limit sum past i128::MAX at 18
    // decimals. The i128 sum returned AggregateOverflow; the 256-bit sum
    // returns their mean.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, a) = setup(&env);
    let [b, c, d] = [0; 3].map(|_| Address::generate(&env));
    for (reviewer, value) in [
        (&a, MAX_AT_DECIMALS_0),
        (&b, MAX_AT_DECIMALS_0),
        (&c, -MAX_AT_DECIMALS_0),
        (&d, -MAX_AT_DECIMALS_0),
    ] {
        assert_eq!(give(&client, reviewer, value, 0), Ok(Ok(())));
    }

    let positive = summary(&client, &[&a, &b]);
    assert_eq!(positive.count, 2);
    assert_eq!(positive.summary_value, MAX_AT_DECIMALS_0);
    let negative = summary(&client, &[&c, &d]);
    assert_eq!(negative.count, 2);
    assert_eq!(negative.summary_value, -MAX_AT_DECIMALS_0);
}

#[test]
fn test_summary_rounds_to_nearest_non_divisible() {
    // M4: one division rounded half away from zero. Two floor divisions
    // turned the mean 1.5 into 1.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, a) = setup(&env);
    let [b, c, d] = [0; 3].map(|_| Address::generate(&env));
    for (reviewer, value) in [(&a, 1), (&b, 2), (&c, -1), (&d, -2)] {
        assert_eq!(give(&client, reviewer, value, 0), Ok(Ok(())));
    }

    let positive = summary(&client, &[&a, &b]);
    assert_eq!(positive.summary_value, 2);
    assert_eq!(positive.summary_value_decimals, 0);
    assert_eq!(summary(&client, &[&c, &d]).summary_value, -2);
}

#[test]
fn test_get_summary_reads_only_recent_feedback_per_client() {
    // #14: past MAX_SUMMARY_FEEDBACK_PER_CLIENT entries a client's oldest
    // entries drop out, so the reads per client are bounded.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    assert_eq!(give(&client, &reviewer, 100, 0), Ok(Ok(())));
    for _ in 0..MAX_SUMMARY_FEEDBACK_PER_CLIENT {
        assert_eq!(give(&client, &reviewer, 0, 0), Ok(Ok(())));
    }

    let result = summary(&client, &[&reviewer]);
    assert_eq!(result.count, MAX_SUMMARY_FEEDBACK_PER_CLIENT);
    assert_eq!(result.summary_value, 0, "the oldest entry must not count");
}

#[test]
fn test_give_feedback_rejects_oversized_tags() {
    // get_summary reads every scanned entry's tags, so their size is capped like the count.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);
    let tag = |len: usize| String::from_str(&env, &"t".repeat(len));
    let give = |tag1: &String, tag2: &String| {
        client.try_give_feedback(
            &reviewer,
            &0,
            &80,
            &0,
            tag1,
            tag2,
            &empty_str(&env),
            &empty_str(&env),
            &zero_hash(&env),
        )
    };

    let max = MAX_TAG_LEN as usize;
    assert_eq!(
        give(&tag(max + 1), &tag(0)),
        Err(Ok(ReputationError::TagTooLong))
    );
    assert_eq!(
        give(&tag(0), &tag(max + 1)),
        Err(Ok(ReputationError::TagTooLong))
    );
    assert!(give(&tag(max), &tag(max)).is_ok());
}
