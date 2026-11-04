#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

use crate::contract::{ValidationRegistryContract, ValidationRegistryContractClient};
use crate::errors::ValidationError;
use identity_registry::contract::{IdentityRegistryContract, IdentityRegistryContractClient};

fn setup(
    e: &Env,
) -> (
    ValidationRegistryContractClient<'_>,
    IdentityRegistryContractClient<'_>,
    Address,
) {
    let admin = Address::generate(e);

    let name = String::from_str(e, "Agent Registry");
    let symbol = String::from_str(e, "AGENT");
    let identity_addr = e.register(IdentityRegistryContract, (admin.clone(), name, symbol));
    let identity_client = IdentityRegistryContractClient::new(e, &identity_addr);

    let val_addr = e.register(ValidationRegistryContract, (admin.clone(), identity_addr));
    let val_client = ValidationRegistryContractClient::new(e, &val_addr);

    (val_client, identity_client, admin)
}

fn test_hash(e: &Env, val: u8) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[0] = val;
    BytesN::from_array(e, &arr)
}

#[test]
fn test_full_validation_lifecycle_with_real_identity() {
    let env = Env::default();
    env.mock_all_auths();
    let (val_client, id_client, _admin) = setup(&env);

    let agent_owner = Address::generate(&env);
    let validator = Address::generate(&env);
    let agent_id = id_client.register(&agent_owner);

    // Agent owner requests validation
    let hash = test_hash(&env, 1);
    val_client.validation_request(
        &agent_owner,
        &validator,
        &agent_id,
        &String::from_str(&env, "https://validate.example.com"),
        &hash,
    );

    // Validator responds
    val_client.validation_response(
        &validator,
        &hash,
        &95,
        &String::from_str(&env, "https://proof.example.com"),
        &test_hash(&env, 2),
        &String::from_str(&env, "capability"),
    );

    // Check status
    let status = val_client.get_validation_status(&hash);
    assert!(status.has_response);
    assert_eq!(status.response, 95);

    // Check summary
    let summary = val_client.get_summary(
        &agent_id,
        &Vec::<Address>::new(&env),
        &String::from_str(&env, ""),
    );
    assert_eq!(summary.count, 1);
    assert_eq!(summary.average_response, 95);

    // Non-owner cannot request validation
    let random = Address::generate(&env);
    let result = val_client.try_validation_request(
        &random,
        &validator,
        &agent_id,
        &String::from_str(&env, ""),
        &test_hash(&env, 99),
    );
    assert!(result.is_err());
}

#[test]
fn test_delegated_caller_cannot_be_validator_with_real_identity() {
    // M3 against the real identity registry: an approved operator may file
    // requests but not name itself validator and answer them.
    let env = Env::default();
    env.mock_all_auths();
    let (val_client, id_client, _admin) = setup(&env);

    let agent_owner = Address::generate(&env);
    let agent_id = id_client.register(&agent_owner);
    let operator = Address::generate(&env);
    id_client.approve(&agent_owner, &operator, &agent_id, &1_000);
    let uri = String::from_str(&env, "");

    assert_eq!(
        val_client.try_validation_request(
            &operator,
            &operator,
            &agent_id,
            &uri,
            &test_hash(&env, 10)
        ),
        Err(Ok(ValidationError::ValidatorNotIndependent))
    );
    let validator = Address::generate(&env);
    val_client.validation_request(&operator, &validator, &agent_id, &uri, &test_hash(&env, 11));
    assert_eq!(
        val_client
            .get_validation_status(&test_hash(&env, 11))
            .validator_address,
        validator
    );
}

#[test]
fn test_agent_operators_cannot_be_validators_with_real_identity() {
    // The validator must not be anyone the reputation registry treats as the agent itself:
    // a single-token approved address or a blanket operator, even when the owner files it.
    let env = Env::default();
    env.mock_all_auths();
    let (val_client, id_client, _admin) = setup(&env);

    let agent_owner = Address::generate(&env);
    let agent_id = id_client.register(&agent_owner);
    let approved = Address::generate(&env);
    id_client.approve(&agent_owner, &approved, &agent_id, &1_000);
    let blanket = Address::generate(&env);
    id_client.approve_for_all(&agent_owner, &blanket, &1_000_000u32);
    let uri = String::from_str(&env, "");

    for (i, validator) in [&agent_owner, &approved, &blanket].into_iter().enumerate() {
        assert_eq!(
            val_client.try_validation_request(
                &agent_owner,
                validator,
                &agent_id,
                &uri,
                &test_hash(&env, 20 + i as u8)
            ),
            Err(Ok(ValidationError::ValidatorNotIndependent))
        );
    }
    // The owner's default agentWallet is the owner, so it is covered above; an outsider passes.
    val_client.validation_request(
        &agent_owner,
        &Address::generate(&env),
        &agent_id,
        &uri,
        &test_hash(&env, 30),
    );
}
