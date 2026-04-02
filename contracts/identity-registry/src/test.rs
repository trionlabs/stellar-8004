#![cfg(test)]

use super::contract::{IdentityRegistryContract, IdentityRegistryContractClient};
use soroban_sdk::{Env, String};

#[test]
fn test_version() {
    let env = Env::default();
    let contract_id = env.register(IdentityRegistryContract, ());
    let client = IdentityRegistryContractClient::new(&env, &contract_id);
    let version = client.version();
    assert_eq!(version, String::from_str(&env, "0.1.0"));
}
