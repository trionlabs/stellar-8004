#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

use crate::contract::{ReputationRegistryContract, ReputationRegistryContractClient};
use identity_registry::contract::{IdentityRegistryContract, IdentityRegistryContractClient};

fn setup(
    e: &Env,
) -> (
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

    // Deploy Reputation Registry with admin + real Identity Registry
    let rep_addr = e.register(ReputationRegistryContract, (admin.clone(), identity_addr));
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

    // Verify summary (must pass an explicit client list per spec)
    let mut clients = Vec::<Address>::new(&env);
    clients.push_back(reviewer.clone());
    let summary = rep_client.get_summary(&agent_id, &clients, &empty_str(&env), &empty_str(&env));
    assert_eq!(summary.count, 1);
    assert_eq!(summary.summary_value, 90);

    // Spec parity (canonical erc-8004): the agent owner is REJECTED from
    // give_feedback. Self-feedback is enforced on-chain via the identity
    // registry's `is_authorized_or_owner` check.
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
    assert!(
        result.is_err(),
        "agent owner self-feedback must be rejected on-chain"
    );

    // Anyone can append a response per the spec - the previously
    // owner-restricted path was a divergence.
    rep_client.append_response(
        &agent_owner,
        &agent_id,
        &reviewer,
        &1,
        &String::from_str(&env, "https://response.json"),
        &zero_hash(&env),
    );
    assert_eq!(rep_client.get_response_count(&agent_id, &reviewer, &1), 1);

    // Revoke the reviewer's feedback - the summary should drop to count 0.
    rep_client.revoke_feedback(&reviewer, &agent_id, &1);
    let summary = rep_client.get_summary(&agent_id, &clients, &empty_str(&env), &empty_str(&env));
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

    // Multiple reviewers - keep within MAX_SUMMARY_CLIENTS (5).
    let mut summary_clients = Vec::<Address>::new(&env);
    for _ in 0..5 {
        let reviewer = Address::generate(&env);
        rep_client.give_feedback(
            &reviewer,
            &agent_id,
            &80,
            &0,
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &empty_str(&env),
            &zero_hash(&env),
        );
        summary_clients.push_back(reviewer);
    }

    let summary = rep_client.get_summary(
        &agent_id,
        &summary_clients,
        &empty_str(&env),
        &empty_str(&env),
    );
    assert_eq!(summary.count, 5);
    // Average of five identical 80-decimal-0 entries = 80.
    assert_eq!(summary.summary_value, 80);
    assert_eq!(summary.summary_value_decimals, 0);

    // Verify client pagination
    let clients = rep_client.get_clients_paginated(&agent_id, &0, &10);
    assert_eq!(clients.len(), 5);
}
