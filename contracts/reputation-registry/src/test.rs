#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger as _},
    Address, BytesN, Env, String, Vec,
};

use crate::contract::{ReputationRegistryContract, ReputationRegistryContractClient};
use crate::storage::{DataKey, TTL_BUMP};

// Mock identity registry for cross-contract calls. Tracks owners + an
// optional "approved" address per agent so we can drive both the
// self-feedback rejection path and the operator-bypass path.
mod mock_identity {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    pub enum DataKey {
        Owner(u32),
        Approved(u32),
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
    // ERC-8004 spec (canonical erc-8004/erc-8004-contracts): the agent
    // owner and any approved operator MUST be rejected from `giveFeedback`.
    // The reference enforces this via `isAuthorizedOrOwner`. Re-anchored
    // after a previous pass mistakenly removed the check based on the
    // chaoslabs reference.
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
    // The spec rejects approved operators too, not just the literal owner.
    // Drives the `is_authorized_or_owner` Approved branch in the mock.
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
    // Spec parity: get_summary returns the AVERAGE (not the sum) over the
    // matching feedback, expressed in mode-decimals (most frequent
    // valueDecimals across the matched set).
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
    // Spec parity: revoked feedback must be excluded from the average.
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
    // Two feedbacks with `decimals=0` (the mode) plus one with `decimals=2`.
    // Spec WAD math: normalize each to 18 decimals, average, then scale
    // back to the mode (0 decimals).
    //
    //   feedback A: value=80,  decimals=0  -> 80e18 in WAD
    //   feedback B: value=90,  decimals=0  -> 90e18 in WAD
    //   feedback C: value=10000, decimals=2 -> 100e18 in WAD (10000 / 100)
    //
    // average WAD = (80 + 90 + 100) * 1e18 / 3 = 90e18
    // mode decimals = 0 (count=2 vs decimals=2 count=1)
    // summary_value = 90e18 / 1e18 = 90
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
    // Spec parity: the canonical erc-8004 reference REVERTS when called
    // without a client filter. The all-clients aggregate path was a
    // Sybil/spam vector explicitly called out by the spec, and our prior
    // pre-computed aggregate path was a non-spec extension. Now removed.
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
    assert_eq!(client.version(), String::from_str(&env, "0.1.0"));
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
    // ERC-8004 spec: appendResponse() is callable by anyone. The off-chain
    // layer is responsible for filtering responses by responder identity
    // (e.g. only responses from the agent owner are treated as authoritative).
    // This used to be restricted to owner/approved which violated the spec.
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

    // A stranger - not the agent owner, not approved - must be able to
    // append a response. The previous owner-only restriction was a spec
    // violation.
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
fn test_upgrade_requires_auth() {
    let env = Env::default();
    let (client, _, _, _) = setup(&env);
    let fake_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
    let result = client.try_upgrade(&fake_hash);
    assert!(result.is_err());
}

#[test]
fn test_value_out_of_range_rejected() {
    // Spec parity: `value` must be in `[-1e38, 1e38]`. Anything bigger is
    // rejected at the entry point so a single feedback cannot wrap the
    // i128 sum in `get_summary`'s WAD normalization.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    // 1e38 + 1 must be rejected.
    let too_big: i128 = 100_000_000_000_000_000_000_000_000_000_000_000_001;
    let result = client.try_give_feedback(
        &reviewer,
        &0,
        &too_big,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(
        result.is_err(),
        "values above MAX_ABS_VALUE must be rejected"
    );

    // Negative bound symmetric.
    let result = client.try_give_feedback(
        &reviewer,
        &0,
        &(-too_big),
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(
        result.is_err(),
        "values below -MAX_ABS_VALUE must be rejected"
    );

    // Exactly at the bound is accepted.
    let max_abs: i128 = 100_000_000_000_000_000_000_000_000_000_000_000_000;
    client.give_feedback(
        &reviewer,
        &0,
        &max_abs,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
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
    // Spec parity: append_response no longer cross-contract calls the
    // identity registry; it relies on the feedback-existence check (a
    // missing agent has zero feedback rows, so any lookup is rejected
    // cleanly with FeedbackNotFound). This test verifies the error path
    // for the "wrong feedback index" case which is the primary user-facing
    // failure mode.
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
            &r,
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
    // After dropping the running aggregate, the per-feedback persistent
    // entries are the load-bearing storage. Verify TTL extension on reads
    // keeps them alive across long idle windows.
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
