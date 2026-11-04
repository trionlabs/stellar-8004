#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger as _},
    Address, BytesN, Env, String, Vec,
};

use crate::contract::{
    ValidationRegistryContract, ValidationRegistryContractClient, MAX_SUMMARY_VALIDATIONS,
    MAX_SUMMARY_VALIDATORS, MAX_TAG_LEN,
};
use crate::errors::ValidationError;
use crate::storage::{self, DataKey, TTL_BUMP};
use crate::types::ValidationStatus;

mod mock_identity {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    pub enum DataKey {
        Owner(u32),
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

        pub fn find_owner(e: &Env, agent_id: u32) -> Option<Address> {
            e.storage().persistent().get(&DataKey::Owner(agent_id))
        }

        pub fn agent_exists(e: &Env, agent_id: u32) -> bool {
            e.storage().persistent().has(&DataKey::Owner(agent_id))
        }

        pub fn get_approved(_e: &Env, _token_id: u32) -> Option<Address> {
            None
        }

        pub fn is_approved_for_all(_e: &Env, _owner: Address, _operator: Address) -> bool {
            false
        }

        pub fn is_authorized_or_owner(e: &Env, spender: Address, agent_id: u32) -> bool {
            Self::find_owner(e, agent_id) == Some(spender)
        }

        pub fn set_wallet(e: &Env, agent_id: u32, wallet: Address) {
            e.storage()
                .persistent()
                .set(&DataKey::Wallet(agent_id), &wallet);
        }

        pub fn get_agent_wallet(e: &Env, agent_id: u32) -> Option<Address> {
            e.storage().persistent().get(&DataKey::Wallet(agent_id))
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
    assert_eq!(client.version(), String::from_str(&env, "0.2.0"));
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
fn test_progressive_validation_response() {
    // Validators can update their response (progressive validation).
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

    // First response: tentative score 90
    client.validation_response(
        &validator,
        &hash,
        &90,
        &String::from_str(&env, ""),
        &test_hash(&env, 2),
        &String::from_str(&env, "tentative"),
    );
    let status1 = client.get_validation_status(&hash);
    assert_eq!(status1.response, 90);
    assert_eq!(status1.tag, String::from_str(&env, "tentative"));

    // Second response from the same validator: revised score 50.
    // Second call updates the score.
    client.validation_response(
        &validator,
        &hash,
        &50,
        &String::from_str(&env, ""),
        &test_hash(&env, 3),
        &String::from_str(&env, "final"),
    );
    let status2 = client.get_validation_status(&hash);
    assert_eq!(status2.response, 50);
    assert_eq!(status2.tag, String::from_str(&env, "final"));

    // A non-validator still cannot update.
    let stranger = Address::generate(&env);
    let result = client.try_validation_response(
        &stranger,
        &hash,
        &10,
        &String::from_str(&env, ""),
        &test_hash(&env, 4),
        &String::from_str(&env, "imposter"),
    );
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

#[test]
fn test_validation_ttl_survives_long_idle_periods_via_reads() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);
    let contract_addr = client.address.clone();

    let hash = test_hash(&env, 7);
    let uri = String::from_str(&env, "https://validate.example.com");
    client.validation_request(&agent_owner, &validator, &0, &uri, &hash);

    // The Validation entry must be at full TTL after the write.
    env.as_contract(&contract_addr, || {
        let ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Validation(hash.clone()));
        assert_eq!(
            ttl, TTL_BUMP,
            "set path should extend the validation TTL to TTL_BUMP"
        );
    });

    // Burn most of the TTL window.
    let advance: u32 = TTL_BUMP - 100;
    env.ledger().with_mut(|l| l.sequence_number += advance);

    // get_validation_status must extend the TTL on read; the entry must survive.
    let status = client.get_validation_status(&hash);
    assert_eq!(status.agent_id, 0);

    env.as_contract(&contract_addr, || {
        let ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Validation(hash.clone()));
        assert_eq!(
            ttl, TTL_BUMP,
            "get_validation_status should re-extend the validation TTL to TTL_BUMP"
        );
    });
}

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
            ValidationError::RenounceDisabled as u32
        )))
    );
    assert_eq!(client.get_owner(), owner);
}

#[test]
fn test_validator_cannot_be_agent_owner() {
    // M3: an owner naming itself validator could answer its own request.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, _) = setup(&env);

    assert_eq!(
        client.try_validation_request(
            &agent_owner,
            &agent_owner,
            &0,
            &String::from_str(&env, ""),
            &test_hash(&env, 1),
        ),
        Err(Ok(ValidationError::ValidatorNotIndependent))
    );
    assert!(!client.request_exists(&test_hash(&env, 1)));
}

#[test]
fn test_validator_cannot_be_agent_wallet() {
    // The bound agentWallet acts for the agent, as in the reputation registry.
    let env = Env::default();
    env.mock_all_auths();
    let (client, identity, agent_owner, _) = setup(&env);
    let wallet = Address::generate(&env);
    identity.set_wallet(&0, &wallet);

    assert_eq!(
        client.try_validation_request(
            &agent_owner,
            &wallet,
            &0,
            &String::from_str(&env, ""),
            &test_hash(&env, 1),
        ),
        Err(Ok(ValidationError::ValidatorNotIndependent))
    );
}

#[test]
fn test_get_summary_reads_only_recent_validations() {
    // H2: get_summary reads at most MAX_SUMMARY_VALIDATIONS answered
    // validations, the most recent ones, so a long history cannot exceed the
    // read limits.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, agent_owner, validator) = setup(&env);
    let empty = String::from_str(&env, "");

    let older = 5;
    for i in 0..MAX_SUMMARY_VALIDATIONS + older {
        let hash = test_hash(&env, i as u8);
        client.validation_request(&agent_owner, &validator, &0, &empty, &hash);
        let response = if i < older { 0 } else { 100 };
        client.validation_response(&validator, &hash, &response, &empty, &hash, &empty);
    }

    let summary = client.get_summary(&0, &Vec::new(&env), &empty);
    assert_eq!(summary.count, MAX_SUMMARY_VALIDATIONS as u64);
    assert_eq!(
        summary.average_response, 100,
        "older validations must not count"
    );
}

/// Distinct request hashes beyond the 256 that `test_hash` covers.
fn hash_n(e: &Env, n: u32) -> BytesN<32> {
    let mut arr = [0xAAu8; 32];
    arr[..4].copy_from_slice(&n.to_be_bytes());
    BytesN::from_array(e, &arr)
}

/// Owner requests a validation from `validator`, which answers `response`.
fn answer(
    client: &ValidationRegistryContractClient<'_>,
    owner: &Address,
    validator: &Address,
    hash: &BytesN<32>,
    response: u32,
    tag: &str,
) {
    let e = &client.env;
    let empty = String::from_str(e, "");
    client.validation_request(owner, validator, &0, &empty, hash);
    client.validation_response(
        validator,
        hash,
        &response,
        &empty,
        hash,
        &String::from_str(e, tag),
    );
}

fn summary(
    client: &ValidationRegistryContractClient<'_>,
    validators: &[&Address],
    tag: &str,
) -> (u64, u32) {
    let e = &client.env;
    let mut list = Vec::new(e);
    for v in validators {
        list.push_back((*v).clone());
    }
    let s = client.get_summary(&0, &list, &String::from_str(e, tag));
    (s.count, s.average_response)
}

/// Total ledger entries of the last invocation: the count that mainnet's
/// `tx_max_footprint_entries` (400 since protocol 23) bounds. The test
/// environment enforces the SDK's older limits (100 entries, 50 writes), so
/// tests that read full windows switch them off and check this instead.
fn footprint_entries(env: &Env) -> u32 {
    let r = env.cost_estimate().resources();
    r.disk_read_entries + r.memory_read_entries
}

#[test]
fn test_unanswered_requests_cannot_hide_an_answer() {
    // The review's attack: the owner files more unanswered requests than the
    // window holds, to another validator, after A's bad answer. Only answers
    // enter the window, so A's answer still counts with and without a filter.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, owner, validator_a) = setup(&env);
    let validator_b = Address::generate(&env);
    let empty = String::from_str(&env, "");

    answer(&client, &owner, &validator_a, &test_hash(&env, 1), 10, "");
    for i in 0..MAX_SUMMARY_VALIDATIONS * 2 {
        client.validation_request(&owner, &validator_b, &0, &empty, &hash_n(&env, i));
    }

    assert_eq!(summary(&client, &[&validator_a], ""), (1, 10));
    assert_eq!(summary(&client, &[], ""), (1, 10));
    assert_eq!(summary(&client, &[&validator_b], ""), (0, 0));
}

#[test]
fn test_get_summary_windows_each_validator_separately() {
    // Each listed validator contributes its own most recent answers; answers
    // by other validators cannot push them out.
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().disable_resource_limits();
    let (client, _, owner, validator_a) = setup(&env);
    let validator_b = Address::generate(&env);

    answer(&client, &owner, &validator_a, &test_hash(&env, 1), 0, "");
    for i in 0..MAX_SUMMARY_VALIDATIONS {
        answer(&client, &owner, &validator_b, &hash_n(&env, i), 100, "");
    }

    // The agent-wide window is now all of B's answers: the documented ceiling
    // of the unfiltered view.
    assert_eq!(
        summary(&client, &[], ""),
        (MAX_SUMMARY_VALIDATIONS as u64, 100)
    );
    // Filtered by A, A's answer is still there.
    assert_eq!(summary(&client, &[&validator_a], ""), (1, 0));
    // A's own newer answers do push its oldest one out.
    let older = 3;
    for i in 0..MAX_SUMMARY_VALIDATIONS + older {
        answer(
            &client,
            &owner,
            &validator_a,
            &hash_n(&env, 1_000 + i),
            50,
            "",
        );
    }
    assert_eq!(
        summary(&client, &[&validator_a], ""),
        (MAX_SUMMARY_VALIDATIONS as u64, 50)
    );
    // Two validators: both windows, and a repeated address counts once.
    assert_eq!(
        summary(&client, &[&validator_a, &validator_b, &validator_a], ""),
        (2 * MAX_SUMMARY_VALIDATIONS as u64, 75)
    );
}

#[test]
fn test_get_summary_caps_validator_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, owner, validator) = setup(&env);
    answer(&client, &owner, &validator, &test_hash(&env, 1), 70, "");

    let mut validators = Vec::new(&env);
    validators.push_back(validator.clone());
    for _ in 1..MAX_SUMMARY_VALIDATORS {
        validators.push_back(Address::generate(&env));
    }
    let empty = String::from_str(&env, "");
    let s = client.get_summary(&0, &validators, &empty);
    assert_eq!((s.count, s.average_response), (1, 70));

    validators.push_back(Address::generate(&env));
    assert_eq!(
        client.try_get_summary(&0, &validators, &empty).err(),
        Some(Ok(ValidationError::TooManyValidators))
    );
}

#[test]
fn test_get_summary_filters_tag_within_window() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, owner, validator) = setup(&env);
    answer(
        &client,
        &owner,
        &validator,
        &test_hash(&env, 1),
        80,
        "security",
    );
    answer(
        &client,
        &owner,
        &validator,
        &test_hash(&env, 2),
        40,
        "uptime",
    );
    answer(
        &client,
        &owner,
        &validator,
        &test_hash(&env, 3),
        60,
        "security",
    );

    assert_eq!(summary(&client, &[&validator], "security"), (2, 70));
    assert_eq!(summary(&client, &[], "uptime"), (1, 40));
    assert_eq!(summary(&client, &[], "none"), (0, 0));
    assert_eq!(summary(&client, &[], ""), (3, 60));
}

#[test]
fn test_updated_response_is_indexed_once() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, owner, validator) = setup(&env);
    let hash = test_hash(&env, 1);
    answer(&client, &owner, &validator, &hash, 90, "");
    let empty = String::from_str(&env, "");
    client.validation_response(&validator, &hash, &30, &empty, &hash, &empty);

    assert_eq!(summary(&client, &[&validator], ""), (1, 30));
    assert_eq!(summary(&client, &[], ""), (1, 30));
}

/// Stores an answered validation the way v1 did: in the request indexes,
/// not in the answered ones.
fn store_v1_answer(
    env: &Env,
    client: &ValidationRegistryContractClient<'_>,
    validator: &Address,
    hash: &BytesN<32>,
    response: u32,
) {
    env.as_contract(&client.address, || {
        let status = ValidationStatus {
            validator_address: validator.clone(),
            agent_id: 0,
            response,
            response_hash: hash.clone(),
            tag: String::from_str(env, ""),
            last_update: 0,
            has_response: true,
        };
        storage::set_validation(env, hash, &status);
        storage::add_agent_validation(env, 0, hash).unwrap();
        storage::add_validator_request(env, validator, hash).unwrap();
    });
}

#[test]
fn test_v1_answer_counts_once_its_validator_updates_it() {
    // v2 has no backfill: an answer given under v1 is not in the answered
    // indexes, so get_summary ignores it until its validator answers again.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, validator) = setup(&env);
    let old = test_hash(&env, 1);
    store_v1_answer(&env, &client, &validator, &old, 20);
    assert_eq!(summary(&client, &[&validator], ""), (0, 0));
    assert_eq!(summary(&client, &[], ""), (0, 0));

    let empty = String::from_str(&env, "");
    client.validation_response(&validator, &old, &40, &empty, &old, &empty);
    assert_eq!(summary(&client, &[&validator], ""), (1, 40));
    client.validation_response(&validator, &old, &60, &empty, &old, &empty);
    assert_eq!(summary(&client, &[&validator], ""), (1, 60));
    assert_eq!(summary(&client, &[], ""), (1, 60));
}

#[test]
fn test_same_validator_answers_under_another_tag_fill_its_window() {
    // The documented ceiling: the tag filter applies inside a validator's
    // window, so that validator's newer answers under another tag push its
    // older tagged answer out of the tag-filtered view.
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().disable_resource_limits();
    let (client, _, owner, validator) = setup(&env);
    answer(
        &client,
        &owner,
        &validator,
        &test_hash(&env, 1),
        10,
        "security",
    );
    assert_eq!(summary(&client, &[&validator], "security"), (1, 10));
    for i in 0..MAX_SUMMARY_VALIDATIONS {
        answer(&client, &owner, &validator, &hash_n(&env, i), 100, "uptime");
    }
    assert_eq!(summary(&client, &[&validator], "security"), (0, 0));
}

#[test]
fn test_validation_response_caps_tag_length() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, owner, validator) = setup(&env);
    let hash = test_hash(&env, 1);
    let empty = String::from_str(&env, "");
    client.validation_request(&owner, &validator, &0, &empty, &hash);

    let long = [b'x'; MAX_TAG_LEN as usize + 1];
    let too_long = String::from_bytes(&env, &long);
    assert_eq!(
        client.try_validation_response(&validator, &hash, &50, &empty, &hash, &too_long),
        Err(Ok(ValidationError::TagTooLong))
    );
    let max = String::from_bytes(&env, &long[..MAX_TAG_LEN as usize]);
    client.validation_response(&validator, &hash, &50, &empty, &hash, &max);
    assert_eq!(client.get_validation_status(&hash).tag, max);
}

#[test]
fn test_worst_case_summary_fits_mainnet_limits() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().disable_resource_limits();
    let (client, _, owner, _) = setup(&env);

    // Five validators, each with a full window of answers carrying the
    // longest tag allowed.
    let tag = std::string::String::from_utf8(std::vec![b't'; MAX_TAG_LEN as usize]).unwrap();
    let mut validators = Vec::new(&env);
    for v in 0..MAX_SUMMARY_VALIDATORS {
        let validator = Address::generate(&env);
        for i in 0..MAX_SUMMARY_VALIDATIONS + 1 {
            let hash = hash_n(&env, v * 1_000 + i);
            answer(&client, &owner, &validator, &hash, 50, &tag);
        }
        validators.push_back(validator);
    }
    let s = client.get_summary(&0, &validators, &String::from_str(&env, &tag));
    assert_eq!(
        s.count,
        (MAX_SUMMARY_VALIDATORS * MAX_SUMMARY_VALIDATIONS) as u64
    );
    // 5 counts + 5 x 32 x 2 + instance; the deployed WASM adds its code
    // entry: 327.
    assert_eq!(footprint_entries(&env), 326);
}
