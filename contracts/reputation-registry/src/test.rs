#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger as _},
    Address, BytesN, Env, String, Vec,
};

use crate::contract::{ReputationRegistryContract, ReputationRegistryContractClient};
use crate::storage::{DataKey, TTL_BUMP};

// We need a mock identity registry for cross-contract calls
mod mock_identity {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    pub enum DataKey {
        Owner(u32),
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

        pub fn find_owner(e: &Env, agent_id: u32) -> Option<Address> {
            e.storage().persistent().get(&DataKey::Owner(agent_id))
        }

        pub fn get_approved(_e: &Env, _token_id: u32) -> Option<Address> {
            None
        }

        pub fn is_approved_for_all(_e: &Env, _owner: Address, _operator: Address) -> bool {
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
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, _) = setup(&env);

    // Agent owner tries to give feedback to own agent - should fail
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
    assert!(result.is_err());
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
fn test_get_summary_aggregate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);

    // Give three feedbacks
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

    let summary = client.get_summary(
        &0,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.count, 3);
    assert_eq!(summary.summary_value, 240); // 80 + 90 + 70
}

#[test]
fn test_revoke_updates_aggregate() {
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

    let summary = client.get_summary(
        &0,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.count, 1);
    assert_eq!(summary.summary_value, 50);
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
fn test_non_owner_cannot_append_response() {
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

    let result = client.try_append_response(
        &stranger,
        &0,
        &reviewer,
        &1,
        &String::from_str(&env, ""),
        &zero_hash(&env),
    );
    assert!(result.is_err());
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
fn test_aggregate_overflow_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, reviewer) = setup(&env);
    let reviewer2 = Address::generate(&env);

    // First feedback maxes out the aggregate.
    client.give_feedback(
        &reviewer,
        &0,
        &i128::MAX,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    // A second positive feedback would wrap. Must be rejected.
    let result = client.try_give_feedback(
        &reviewer2,
        &0,
        &1,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(
        result.is_err(),
        "checked_add should reject the wrapping addition"
    );

    // The aggregate must still hold the original max value, untouched by the
    // failed second call.
    let summary = client.get_summary(
        &0,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.summary_value, i128::MAX);
    assert_eq!(summary.count, 1);
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
fn test_append_response_on_missing_agent_returns_error_not_panic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, identity, agent_owner, reviewer) = setup(&env);

    // First give feedback while the agent exists.
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

    // Now wipe the agent and try to respond.
    identity.clear_owner(&0);
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
        "append_response against a missing agent must return Err, not panic"
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
    // exactly 5 contributions (50 points) - the trailing 2 are silently
    // dropped to keep storage reads bounded.
    let mut clients_arg = Vec::<Address>::new(&env);
    for r in &reviewers {
        clients_arg.push_back(r.clone());
    }
    let summary = client.get_summary(&0, &clients_arg, &empty_str(&env), &empty_str(&env));
    assert_eq!(summary.count, 5);
    assert_eq!(summary.summary_value, 50);
}

#[test]
fn test_aggregate_ttl_survives_long_idle_periods_via_reads() {
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

    // Aggregate persistent entry must be at full TTL after a write.
    env.as_contract(&contract_addr, || {
        let ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::AgentAggregate(0));
        assert_eq!(
            ttl, TTL_BUMP,
            "set path should extend the aggregate TTL to TTL_BUMP"
        );
    });

    // Burn most of the TTL window.
    let advance: u32 = TTL_BUMP - 100;
    env.ledger().with_mut(|l| l.sequence_number += advance);

    // get_summary must extend the TTL on read; the aggregate must survive.
    let summary = client.get_summary(
        &0,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.count, 1);
    assert_eq!(summary.summary_value, 80);

    env.as_contract(&contract_addr, || {
        let ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::AgentAggregate(0));
        assert_eq!(
            ttl, TTL_BUMP,
            "get_summary should re-extend the aggregate TTL to TTL_BUMP"
        );
    });
}
