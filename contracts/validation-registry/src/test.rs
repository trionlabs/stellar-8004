#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

use crate::contract::{ValidationRegistryContract, ValidationRegistryContractClient};

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
    ValidationRegistryContractClient<'_>,
    MockIdentityRegistryClient<'_>,
    Address,
    Address,
) {
    let agent_owner = Address::generate(e);
    let validator = Address::generate(e);

    let identity_addr = e.register(MockIdentityRegistry, ());
    let identity_client = MockIdentityRegistryClient::new(e, &identity_addr);
    identity_client.set_owner(&0, &agent_owner);

    let admin = Address::generate(e);
    let val_addr = e.register(ValidationRegistryContract, (admin, identity_addr));
    let val_client = ValidationRegistryContractClient::new(e, &val_addr);

    (val_client, identity_client, agent_owner, validator)
}

fn test_hash(e: &Env, val: u8) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[0] = val;
    BytesN::from_array(e, &arr)
}

#[test]
fn test_validation_request_and_response() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);

    let hash = test_hash(&env, 1);
    let uri = String::from_str(&env, "https://validate.example.com");

    client.validation_request(&agent_owner, &validator, &0, &uri, &hash);

    let status = client.get_validation_status(&hash);
    assert_eq!(status.agent_id, 0);
    assert_eq!(status.validator_address, validator);
    assert!(!status.has_response);

    // Validator responds
    let response_hash = test_hash(&env, 2);
    client.validation_response(
        &validator,
        &hash,
        &85,
        &String::from_str(&env, "https://proof.example.com"),
        &response_hash,
        &String::from_str(&env, "capability"),
    );

    let status = client.get_validation_status(&hash);
    assert!(status.has_response);
    assert_eq!(status.response, 85);
    assert_eq!(status.tag, String::from_str(&env, "capability"));
}

#[test]
fn test_non_owner_cannot_request() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, validator) = setup(&env);
    let random = Address::generate(&env);

    let hash = test_hash(&env, 1);
    let result =
        client.try_validation_request(&random, &validator, &0, &String::from_str(&env, ""), &hash);
    assert!(result.is_err());
}

#[test]
fn test_invalid_response_value() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);

    let hash = test_hash(&env, 1);
    client.validation_request(
        &agent_owner,
        &validator,
        &0,
        &String::from_str(&env, ""),
        &hash,
    );

    // Response > 100 should fail
    let result = client.try_validation_response(
        &validator,
        &hash,
        &101,
        &String::from_str(&env, ""),
        &test_hash(&env, 2),
        &String::from_str(&env, ""),
    );
    assert!(result.is_err());
}

#[test]
fn test_get_summary() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);

    // Create two validation requests
    let hash1 = test_hash(&env, 1);
    let hash2 = test_hash(&env, 2);

    client.validation_request(
        &agent_owner,
        &validator,
        &0,
        &String::from_str(&env, ""),
        &hash1,
    );
    client.validation_request(
        &agent_owner,
        &validator,
        &0,
        &String::from_str(&env, ""),
        &hash2,
    );

    // Respond to both
    client.validation_response(
        &validator,
        &hash1,
        &80,
        &String::from_str(&env, ""),
        &test_hash(&env, 10),
        &String::from_str(&env, ""),
    );
    client.validation_response(
        &validator,
        &hash2,
        &60,
        &String::from_str(&env, ""),
        &test_hash(&env, 11),
        &String::from_str(&env, ""),
    );

    let summary = client.get_summary(&0, &Vec::<Address>::new(&env), &String::from_str(&env, ""));
    assert_eq!(summary.count, 2);
    assert_eq!(summary.average_response, 70); // (80 + 60) / 2
}

#[test]
fn test_pagination() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);

    // Create 3 requests
    for i in 0..3u8 {
        let hash = test_hash(&env, i + 1);
        client.validation_request(
            &agent_owner,
            &validator,
            &0,
            &String::from_str(&env, ""),
            &hash,
        );
    }

    let page1 = client.get_agent_validations_paginated(&0, &0, &2);
    assert_eq!(page1.len(), 2);

    let page2 = client.get_agent_validations_paginated(&0, &2, &2);
    assert_eq!(page2.len(), 1);
}

#[test]
fn test_version() {
    let env = Env::default();
    let (client, _, _, _) = setup(&env);
    assert_eq!(client.version(), String::from_str(&env, "0.1.0"));
}

// --- Negative tests ---

#[test]
fn test_non_designated_validator_cannot_respond() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);
    let stranger = Address::generate(&env);

    let hash = test_hash(&env, 1);
    client.validation_request(
        &agent_owner,
        &validator,
        &0,
        &String::from_str(&env, ""),
        &hash,
    );

    // Stranger tries to respond instead of designated validator
    let result = client.try_validation_response(
        &stranger,
        &hash,
        &80,
        &String::from_str(&env, ""),
        &test_hash(&env, 2),
        &String::from_str(&env, ""),
    );
    assert!(result.is_err());
}

#[test]
fn test_duplicate_request_hash_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);

    let hash = test_hash(&env, 1);
    client.validation_request(
        &agent_owner,
        &validator,
        &0,
        &String::from_str(&env, ""),
        &hash,
    );

    // Same hash again should fail
    let result = client.try_validation_request(
        &agent_owner,
        &validator,
        &0,
        &String::from_str(&env, ""),
        &hash,
    );
    assert!(result.is_err());
}

#[test]
fn test_response_to_nonexistent_request_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, validator) = setup(&env);

    let result = client.try_validation_response(
        &validator,
        &test_hash(&env, 99),
        &50,
        &String::from_str(&env, ""),
        &test_hash(&env, 2),
        &String::from_str(&env, ""),
    );
    assert!(result.is_err());
}

#[test]
fn test_double_response_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);

    let hash = test_hash(&env, 1);
    client.validation_request(
        &agent_owner,
        &validator,
        &0,
        &String::from_str(&env, ""),
        &hash,
    );

    // First response succeeds
    client.validation_response(
        &validator,
        &hash,
        &90,
        &String::from_str(&env, ""),
        &test_hash(&env, 2),
        &String::from_str(&env, ""),
    );

    // Second response fails
    let result = client.try_validation_response(
        &validator,
        &hash,
        &50,
        &String::from_str(&env, ""),
        &test_hash(&env, 3),
        &String::from_str(&env, ""),
    );
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
fn test_validation_request_on_missing_agent_returns_error_not_panic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, identity, agent_owner, validator) = setup(&env);

    // Wipe the agent so identity.find_owner returns None.
    identity.clear_owner(&0);

    let hash = test_hash(&env, 42);
    let uri = String::from_str(&env, "https://validate.example.com");
    let result = client.try_validation_request(&agent_owner, &validator, &0, &uri, &hash);
    assert!(
        result.is_err(),
        "validation_request against a missing agent must return Err, not panic"
    );
}
