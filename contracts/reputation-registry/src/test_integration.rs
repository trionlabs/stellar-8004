#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

use crate::contract::{ReputationRegistryContract, ReputationRegistryContractClient};
use identity_registry::contract::{IdentityRegistryContract, IdentityRegistryContractClient};

fn setup(e: &Env) -> (
    ReputationRegistryContractClient<'_>,
    IdentityRegistryContractClient<'_>,
    Address,
) {
    let admin = Address::generate(e);

    // Deploy real Identity Registry
    let name = String::from_str(e, "Agent Registry");
    let symbol = String::from_str(e, "AGENT");
    let identity_addr = e.register(IdentityRegistryContract, (admin.clone(), name, symbol));
    let identity_client = IdentityRegistryContractClient::new(e, &identity_addr);

    // Deploy Reputation Registry with real Identity Registry
    let rep_addr = e.register(ReputationRegistryContract, (identity_addr,));
    let rep_client = ReputationRegistryContractClient::new(e, &rep_addr);

    (rep_client, identity_client, admin)
}

fn empty_str(e: &Env) -> String {
    String::from_str(e, "")
}

fn zero_hash(e: &Env) -> BytesN<32> {
    BytesN::from_array(e, &[0u8; 32])
}

#[test]
fn test_full_lifecycle_with_real_identity() {
    let env = Env::default();
    env.mock_all_auths();
    let (rep_client, id_client, _admin) = setup(&env);

    // Register an agent
    let agent_owner = Address::generate(&env);
    let reviewer = Address::generate(&env);
    let agent_id = id_client.register_with_uri(
        &agent_owner,
        &String::from_str(&env, "https://agent.example.com/meta.json"),
    );
    assert_eq!(agent_id, 0);

    // Reviewer gives feedback
    rep_client.give_feedback(
        &reviewer,
        &agent_id,
        &90,
        &0,
        &String::from_str(&env, "reliability"),
        &String::from_str(&env, "uptime"),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );

    // Verify feedback stored
    let fb = rep_client.read_feedback(&agent_id, &reviewer, &1);
    assert_eq!(fb.value, 90);

    // Verify summary
    let summary = rep_client.get_summary(
        &agent_id,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.count, 1);
    assert_eq!(summary.summary_value, 90);

    // Agent owner cannot self-review
    let result = rep_client.try_give_feedback(
        &agent_owner,
        &agent_id,
        &100,
        &0,
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &empty_str(&env),
        &zero_hash(&env),
    );
    assert!(result.is_err());

    // Agent owner responds to feedback
    rep_client.append_response(
        &agent_owner,
        &agent_id,
        &reviewer,
        &1,
        &String::from_str(&env, "https://response.json"),
        &zero_hash(&env),
    );
    assert_eq!(rep_client.get_response_count(&agent_id, &reviewer, &1), 1);

    // Revoke feedback updates aggregate
    rep_client.revoke_feedback(&reviewer, &agent_id, &1);
    let summary = rep_client.get_summary(
        &agent_id,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.count, 0);
    assert_eq!(summary.summary_value, 0);
}

#[test]
fn test_multiple_reviewers_with_real_identity() {
    let env = Env::default();
    env.mock_all_auths();
    let (rep_client, id_client, _admin) = setup(&env);

    let agent_owner = Address::generate(&env);
    let agent_id = id_client.register(&agent_owner);

    // Multiple reviewers
    let mut total = 0i128;
    for _ in 0..5 {
        let reviewer = Address::generate(&env);
        let val = 80i128;
        rep_client.give_feedback(
            &reviewer, &agent_id, &val, &0,
            &empty_str(&env), &empty_str(&env),
            &empty_str(&env), &empty_str(&env), &zero_hash(&env),
        );
        total += val;
    }

    let summary = rep_client.get_summary(
        &agent_id,
        &Vec::<Address>::new(&env),
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.count, 5);
    assert_eq!(summary.summary_value, total);

    // Verify client pagination
    let clients = rep_client.get_clients_paginated(&agent_id, &0, &10);
    assert_eq!(clients.len(), 5);
}
