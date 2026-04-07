#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger as _},
    Address, Bytes, Env, String, Vec,
};

use crate::contract::{IdentityRegistryContract, IdentityRegistryContractClient};
use crate::types::MetadataEntry;

fn create_client<'a>(e: &Env) -> (IdentityRegistryContractClient<'a>, Address) {
    let owner = Address::generate(e);
    let name = String::from_str(e, "Agent Registry");
    let symbol = String::from_str(e, "AGENT");
    let address = e.register(IdentityRegistryContract, (owner.clone(), name, symbol));
    (IdentityRegistryContractClient::new(e, &address), owner)
}

#[test]
fn test_version() {
    let env = Env::default();
    let (client, _) = create_client(&env);
    let version = client.version();
    assert_eq!(version, String::from_str(&env, "0.1.0"));
}

#[test]
fn test_register() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);

    let agent_id = client.register(&user);
    assert_eq!(agent_id, 0);
    assert_eq!(client.balance(&user), 1);
    assert_eq!(client.owner_of(&0), user);
}

#[test]
fn test_register_with_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let uri = String::from_str(&env, "https://example.com/agent.json");

    let agent_id = client.register_with_uri(&user, &uri);
    assert_eq!(agent_id, 0);
    assert_eq!(client.agent_uri(&0), uri);
}

#[test]
fn test_register_full() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let uri = String::from_str(&env, "https://example.com/agent.json");
    let key = String::from_str(&env, "domain");
    let value = Bytes::from_slice(&env, b"example.com");

    let metadata = Vec::from_array(
        &env,
        [MetadataEntry {
            key: key.clone(),
            value: value.clone(),
        }],
    );

    let agent_id = client.register_full(&user, &uri, &metadata);
    assert_eq!(agent_id, 0);
    assert_eq!(client.agent_uri(&0), uri);
    assert_eq!(client.get_metadata(&0, &key), Some(value));
}

#[test]
fn test_sequential_ids() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);

    let id0 = client.register(&user);
    let id1 = client.register(&user);
    let id2 = client.register(&user);
    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(client.balance(&user), 3);
}

#[test]
fn test_set_agent_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);

    client.register(&user);
    let new_uri = String::from_str(&env, "https://new.example.com/agent.json");
    client.set_agent_uri(&user, &0, &new_uri);
    assert_eq!(client.agent_uri(&0), new_uri);
}

#[test]
fn test_set_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);

    client.register(&user);
    let key = String::from_str(&env, "service");
    let value = Bytes::from_slice(&env, b"mcp");
    client.set_metadata(&user, &0, &key, &value);
    assert_eq!(client.get_metadata(&0, &key), Some(value));
}

#[test]
fn test_set_agent_wallet() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let wallet = Address::generate(&env);

    client.register(&user);
    client.set_agent_wallet(&user, &0, &wallet);
    assert_eq!(client.get_agent_wallet(&0), Some(wallet));
}

#[test]
fn test_transfer_clears_wallet() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let wallet = Address::generate(&env);

    client.register(&user1);
    client.set_agent_wallet(&user1, &0, &wallet);
    assert_eq!(client.get_agent_wallet(&0), Some(wallet.clone()));

    client.transfer(&user1, &user2, &0);
    assert_eq!(client.owner_of(&0), user2);
    assert_eq!(client.get_agent_wallet(&0), None);
}

#[test]
fn test_name_and_symbol() {
    let env = Env::default();
    let (client, _) = create_client(&env);
    assert_eq!(client.name(), String::from_str(&env, "Agent Registry"));
    assert_eq!(client.symbol(), String::from_str(&env, "AGENT"));
}

// --- Negative tests ---

#[test]
fn test_non_owner_cannot_set_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);

    client.register(&owner);
    let result =
        client.try_set_agent_uri(&stranger, &0, &String::from_str(&env, "https://evil.com"));
    assert!(result.is_err());
}

#[test]
fn test_non_owner_cannot_set_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);

    client.register(&owner);
    let result = client.try_set_metadata(
        &stranger,
        &0,
        &String::from_str(&env, "key"),
        &Bytes::from_slice(&env, b"val"),
    );
    assert!(result.is_err());
}

#[test]
fn test_non_owner_cannot_set_wallet() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    let wallet = Address::generate(&env);

    client.register(&owner);
    let result = client.try_set_agent_wallet(&stranger, &0, &wallet);
    assert!(result.is_err());
}

#[test]
fn test_non_owner_cannot_unset_wallet() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    let wallet = Address::generate(&env);

    client.register(&owner);
    client.set_agent_wallet(&owner, &0, &wallet);
    let result = client.try_unset_agent_wallet(&stranger, &0);
    assert!(result.is_err());
}

#[test]
fn test_upgrade_requires_auth() {
    let env = Env::default();
    // No mock_all_auths - proves auth is enforced
    let (client, _admin) = create_client(&env);
    let fake_hash = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);
    let result = client.try_upgrade(&fake_hash);
    assert!(result.is_err());
}

#[test]
fn test_find_owner_returns_none_for_missing_agent() {
    let env = Env::default();
    let (client, _) = create_client(&env);
    // No agent has been registered yet.
    assert_eq!(client.find_owner(&0), None);
    assert_eq!(client.find_owner(&999), None);
}

#[test]
fn test_find_owner_returns_owner_for_registered_agent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);

    let agent_id = client.register(&user);
    assert_eq!(client.find_owner(&agent_id), Some(user));
}

#[test]
fn test_set_uri_on_missing_agent_returns_error_not_panic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let stranger = Address::generate(&env);
    // try_set_agent_uri must return Err(AgentNotFound), not panic.
    let result = client.try_set_agent_uri(&stranger, &999, &String::from_str(&env, "ipfs://nope"));
    assert!(result.is_err());
}

#[test]
fn test_set_metadata_on_missing_agent_returns_error_not_panic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let stranger = Address::generate(&env);
    let result = client.try_set_metadata(
        &stranger,
        &999,
        &String::from_str(&env, "k"),
        &Bytes::from_slice(&env, b"v"),
    );
    assert!(result.is_err());
}

#[test]
fn test_set_wallet_on_missing_agent_returns_error_not_panic() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let stranger = Address::generate(&env);
    let new_wallet = Address::generate(&env);
    let result = client.try_set_agent_wallet(&stranger, &999, &new_wallet);
    assert!(result.is_err());
}

#[test]
fn test_extend_ttl_bumps_oz_owner_and_balance() {
    use stellar_tokens::non_fungible::{NFTStorageKey, BALANCE_EXTEND_AMOUNT, OWNER_EXTEND_AMOUNT};

    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let agent_id = client.register(&user);
    let contract_addr = client.address.clone();

    // Advance the ledger so the OZ Owner / Balance TTLs are no longer at
    // their initial high-water mark - this is the realistic scenario where
    // an idle agent is at risk of archival.
    let advance: u32 = OWNER_EXTEND_AMOUNT - 100;
    env.ledger().with_mut(|l| l.sequence_number += advance);

    // Sanity: the Owner entry has been depleted by `advance` ledgers.
    env.as_contract(&contract_addr, || {
        let owner_ttl = env
            .storage()
            .persistent()
            .get_ttl(&NFTStorageKey::Owner(agent_id));
        assert!(owner_ttl < OWNER_EXTEND_AMOUNT);
    });

    // Now bump TTL via the public extend_ttl endpoint.
    client.extend_ttl(&agent_id);

    // The OZ Owner and Balance entries must now be at full extension.
    env.as_contract(&contract_addr, || {
        let owner_ttl = env
            .storage()
            .persistent()
            .get_ttl(&NFTStorageKey::Owner(agent_id));
        assert_eq!(
            owner_ttl, OWNER_EXTEND_AMOUNT,
            "OZ Owner entry should be extended by extend_ttl"
        );

        let balance_ttl = env
            .storage()
            .persistent()
            .get_ttl(&NFTStorageKey::Balance(user.clone()));
        assert_eq!(
            balance_ttl, BALANCE_EXTEND_AMOUNT,
            "OZ Balance entry should be extended by extend_ttl"
        );
    });
}
