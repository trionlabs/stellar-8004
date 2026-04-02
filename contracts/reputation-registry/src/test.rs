#![cfg(test)]

use super::contract::{ReputationRegistryContract, ReputationRegistryContractClient};
use soroban_sdk::{Env, String};

#[test]
fn test_version() {
    let env = Env::default();
    let contract_id = env.register(ReputationRegistryContract, ());
    let client = ReputationRegistryContractClient::new(&env, &contract_id);
    let version = client.version();
    assert_eq!(version, String::from_str(&env, "0.1.0"));
}
