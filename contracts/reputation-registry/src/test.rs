#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

use crate::contract::{ReputationRegistryContract, ReputationRegistryContractClient};

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

        pub fn owner_of(e: &Env, token_id: u32) -> Address {
            e.storage()
                .persistent()
                .get(&DataKey::Owner(token_id))
                .unwrap()
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
