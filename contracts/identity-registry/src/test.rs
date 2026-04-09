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
fn test_token_uri_returns_agent_uri() {
    // ERC-8004 inherits IERC721Metadata. Cross-chain consumers calling
    // `tokenURI(agentId)` per the standard interface MUST get the agent's
    // URI back, not the OZ default of `base_uri + token_id` (which is
    // empty for us). The IdentityBase override on token_uri exists to
    // satisfy this; this test pins the behavior so a future refactor
    // cannot silently break the IERC721Metadata contract surface.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let uri = String::from_str(&env, "https://example.com/agent.json");

    client.register_with_uri(&user, &uri);
    assert_eq!(client.token_uri(&0), uri);

    // An agent registered without a URI should still return an empty
    // string from `token_uri` rather than panic, matching the behavior
    // of `agent_uri`'s `Option::None` -> empty fallback in the override.
    let user2 = Address::generate(&env);
    client.register(&user2);
    assert_eq!(client.token_uri(&1), String::from_str(&env, ""));
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
fn test_register_initializes_agent_wallet_to_caller() {
    // Spec parity (canonical erc-8004): every register* MUST initialize the
    // reserved `agentWallet` metadata key to the caller's address. The
    // off-chain layer reads this from the MetadataSet event and seeds the
    // explorer DB with `agent_wallet = owner` until the owner explicitly
    // re-binds it.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);

    let user1 = Address::generate(&env);
    client.register(&user1);
    assert_eq!(client.get_agent_wallet(&0), Some(user1.clone()));

    let user2 = Address::generate(&env);
    client.register_with_uri(&user2, &String::from_str(&env, "ipfs://x"));
    assert_eq!(client.get_agent_wallet(&1), Some(user2.clone()));

    let user3 = Address::generate(&env);
    client.register_full(&user3, &String::from_str(&env, "ipfs://y"), &Vec::new(&env));
    assert_eq!(client.get_agent_wallet(&2), Some(user3.clone()));
}

#[test]
fn test_get_metadata_for_agent_wallet_returns_strkey_bytes() {
    // Spec parity: getMetadata(agentId, "agentWallet") MUST return the
    // wallet bytes. We expose the StrKey-encoded ASCII representation
    // (56 bytes) so cross-chain consumers can decode it with any standard
    // Stellar library.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);

    client.register(&user);

    let key = String::from_str(&env, "agentWallet");
    let bytes = client.get_metadata(&0, &key).expect("agentWallet metadata");
    assert_eq!(
        bytes.len(),
        56,
        "Stellar StrKey addresses are exactly 56 ASCII characters"
    );

    // After unset, the metadata read should return None.
    client.unset_agent_wallet(&user, &0);
    assert_eq!(client.get_metadata(&0, &key), None);
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
fn test_transfer_clears_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.register(&user1);
    let key1 = String::from_str(&env, "domain");
    let key2 = String::from_str(&env, "verified");
    client.set_metadata(
        &user1,
        &0,
        &key1,
        &Bytes::from_slice(&env, b"trionlabs.dev"),
    );
    client.set_metadata(&user1, &0, &key2, &Bytes::from_slice(&env, b"true"));
    assert!(client.get_metadata(&0, &key1).is_some());
    assert!(client.get_metadata(&0, &key2).is_some());

    client.transfer(&user1, &user2, &0);

    // The new owner must not inherit claims authored by the previous owner.
    assert_eq!(client.get_metadata(&0, &key1), None);
    assert_eq!(client.get_metadata(&0, &key2), None);
}

#[test]
fn test_set_metadata_rejects_excess_keys() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let agent_id = client.register(&user);

    // Fill the index up to the cap.
    for i in 0..100u32 {
        // Vary the key so each one is distinct. soroban_sdk::String has no
        // formatting helper at runtime, so build a short ASCII suffix.
        let mut buf = [b'k', b'_', 0, 0, 0, 0];
        let mut n = i;
        let mut idx = 5usize;
        if n == 0 {
            buf[2] = b'0';
        } else {
            while n > 0 && idx >= 2 {
                buf[idx] = b'0' + (n % 10) as u8;
                n /= 10;
                idx -= 1;
            }
        }
        let s = core::str::from_utf8(&buf).unwrap().trim_end_matches('\0');
        let key = String::from_str(&env, s);
        client.set_metadata(&user, &agent_id, &key, &Bytes::from_slice(&env, b"v"));
    }

    // The 101st distinct key must be rejected.
    let overflow_key = String::from_str(&env, "overflow");
    let result = client.try_set_metadata(
        &user,
        &agent_id,
        &overflow_key,
        &Bytes::from_slice(&env, b"v"),
    );
    assert!(result.is_err());

    // Updating an existing key must still be allowed at the cap.
    let existing = String::from_str(&env, "k_0");
    let update = client.try_set_metadata(
        &user,
        &agent_id,
        &existing,
        &Bytes::from_slice(&env, b"updated"),
    );
    assert!(update.is_ok());
}

#[test]
fn test_extend_ttl_extends_metadata_entries() {
    use crate::storage::DataKey;

    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let agent_id = client.register(&user);
    let contract_addr = client.address.clone();

    let key = String::from_str(&env, "domain");
    client.set_metadata(
        &user,
        &agent_id,
        &key,
        &Bytes::from_slice(&env, b"trionlabs"),
    );

    // Burn most of the TTL window without touching the metadata.
    let advance: u32 = crate::storage::TTL_BUMP - 100;
    env.ledger().with_mut(|l| l.sequence_number += advance);

    // extend_ttl must reach into the MetadataKeys index and bump the
    // individual Metadata entry.
    client.extend_ttl(&agent_id);

    env.as_contract(&contract_addr, || {
        let ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Metadata(agent_id, key.clone()));
        assert_eq!(
            ttl,
            crate::storage::TTL_BUMP,
            "extend_ttl should bump the metadata entry to TTL_BUMP"
        );
    });
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
fn test_is_authorized_or_owner() {
    // Spec parity: this is the cross-contract auth view used by the
    // canonical reputation registry's self-feedback prevention. It must
    // return true for the owner, true for an explicit operator (via
    // approve / approve_for_all), false for unrelated addresses, and
    // false for non-existent agents (without panicking).
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);

    // Missing agent.
    let stranger = Address::generate(&env);
    assert!(!client.is_authorized_or_owner(&stranger, &0));

    let owner = Address::generate(&env);
    let agent_id = client.register(&owner);

    // Owner.
    assert!(client.is_authorized_or_owner(&owner, &agent_id));
    // Random stranger.
    assert!(!client.is_authorized_or_owner(&stranger, &agent_id));

    // Per-agent approval.
    let operator = Address::generate(&env);
    client.approve(&owner, &operator, &agent_id, &1_000_000u32);
    assert!(client.is_authorized_or_owner(&operator, &agent_id));

    // Approve-for-all.
    let blanket = Address::generate(&env);
    client.approve_for_all(&owner, &blanket, &1_000_000u32);
    assert!(client.is_authorized_or_owner(&blanket, &agent_id));
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
fn test_set_metadata_rejects_oversized_key() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let agent_id = client.register(&user);

    // Build a 65-byte key (one over the cap of 64).
    let oversized_key = String::from_str(
        &env,
        "0123456789012345678901234567890123456789012345678901234567890123_",
    );
    let result = client.try_set_metadata(
        &user,
        &agent_id,
        &oversized_key,
        &Bytes::from_slice(&env, b"v"),
    );
    assert!(result.is_err());
}

#[test]
fn test_set_metadata_rejects_oversized_value() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let agent_id = client.register(&user);

    // 4097 bytes - one over the cap of 4096.
    let oversized_value = Bytes::from_slice(&env, &[0u8; 4097]);
    let result = client.try_set_metadata(
        &user,
        &agent_id,
        &String::from_str(&env, "k"),
        &oversized_value,
    );
    assert!(result.is_err());
}

#[test]
fn test_set_metadata_rejects_reserved_agent_wallet_key() {
    // ERC-8004 spec: `agentWallet` is a reserved metadata key. It must be
    // settable only via the dedicated `set_agent_wallet` entry point with
    // wallet auth, never through `setMetadata`.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let agent_id = client.register(&user);

    let reserved = String::from_str(&env, "agentWallet");
    let result = client.try_set_metadata(
        &user,
        &agent_id,
        &reserved,
        &Bytes::from_slice(&env, b"GAFAKE"),
    );
    assert!(result.is_err());
}

#[test]
fn test_register_full_rejects_excess_metadata_entries() {
    // register_full must enforce the same MAX_METADATA_KEYS cap as
    // set_metadata. Without this check, a caller could bypass the cap
    // and store >100 keys on a single agent, making subsequent
    // set_metadata calls permanently fail.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);

    let mut entries = Vec::new(&env);
    for i in 0..101u32 {
        let mut buf = [b'k', b'_', 0, 0, 0, 0];
        let mut n = i;
        let mut idx = 5usize;
        if n == 0 {
            buf[2] = b'0';
        } else {
            while n > 0 && idx >= 2 {
                buf[idx] = b'0' + (n % 10) as u8;
                n /= 10;
                idx -= 1;
            }
        }
        let s = core::str::from_utf8(&buf).unwrap().trim_end_matches('\0');
        entries.push_back(MetadataEntry {
            key: String::from_str(&env, s),
            value: Bytes::from_slice(&env, b"v"),
        });
    }

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.register_full(&user, &String::from_str(&env, "ipfs://x"), &entries)
    }));
    assert!(
        result.is_err(),
        "register_full with >100 metadata entries must be rejected"
    );
}

#[test]
fn test_register_full_rejects_reserved_agent_wallet_key() {
    // Same constraint as set_metadata: agentWallet cannot be smuggled in
    // through the registration metadata array.
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let metadata = Vec::from_array(
        &env,
        [MetadataEntry {
            key: String::from_str(&env, "agentWallet"),
            value: Bytes::from_slice(&env, b"GAFAKE"),
        }],
    );

    // register_full uses assert! and panics on the reserved key, so this
    // call should fail at the host level.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.register_full(&user, &String::from_str(&env, ""), &metadata)
    }));
    assert!(result.is_err());
}

#[test]
fn test_set_metadata_accepts_max_size_payload() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = create_client(&env);
    let user = Address::generate(&env);
    let agent_id = client.register(&user);

    // Exactly at the cap - must be accepted.
    let key_64 = String::from_str(
        &env,
        "0123456789012345678901234567890123456789012345678901234567890123",
    );
    let value_4096 = Bytes::from_slice(&env, &[0u8; 4096]);
    client.set_metadata(&user, &agent_id, &key_64, &value_4096);
    assert_eq!(client.get_metadata(&agent_id, &key_64), Some(value_4096));
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
