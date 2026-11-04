//! State written by the mainnet v1 code stays readable and writable after the
//! timelocked upgrade to v2, including records that v2 no longer accepts.
use identity_registry::{
    contract::IdentityRegistryContractClient, errors::IdentityError, types::MetadataEntry,
};
use reputation_registry::{contract::ReputationRegistryContractClient, errors::ReputationError};
use soroban_sdk::{testutils::Address as _, vec, Address, Bytes, BytesN, String};
use validation_registry::{contract::ValidationRegistryContractClient, errors::ValidationError};

use crate::{advance, mainnet_env, upload, v1, v2_wasm, TIMELOCK_LEDGERS};

#[test]
fn mainnet_v1_state_survives_upgrade_to_v2() {
    let env = mainnet_env();
    let s = |text: &str| String::from_str(&env, text);
    let b = |bytes: &[u8]| Bytes::from_slice(&env, bytes);
    let h = |n: u8| BytesN::from_array(&env, &[n; 32]);
    let [admin, new_admin, alice, bob, carol, dave, erin, frank, wallet, operator] =
        [(); 10].map(|_| Address::generate(&env));
    let [r1, r2, r3, responder, validator_a, validator_b] =
        [(); 6].map(|_| Address::generate(&env));

    // The three registries, deployed from the mainnet bytes and wired as on mainnet.
    let id = env.register(
        v1::identity::WASM,
        (admin.clone(), s("Agent Registry"), s("AGENT")),
    );
    let rep = env.register(v1::reputation::WASM, (admin.clone(), id.clone()));
    let val = env.register(v1::validation::WASM, (admin.clone(), id.clone()));
    let id1 = v1::identity::Client::new(&env, &id);
    let rep1 = v1::reputation::Client::new(&env, &rep);
    let val1 = v1::validation::Client::new(&env, &val);

    // Identity: agents 0-4 cover every storage slot.
    let entry = |key: &str, value: &[u8]| v1::identity::MetadataEntry {
        key: s(key),
        value: b(value),
    };
    assert_eq!(id1.register(&alice), 0); // no URI, wallet = owner
    assert_eq!(id1.register_with_uri(&bob, &s("ipfs://bob")), 1);
    let metadata = vec![&env, entry("name", b"Carol"), entry("skills", b"search")];
    assert_eq!(id1.register_full(&carol, &s("ipfs://carol"), &metadata), 2);
    id1.set_agent_wallet(&carol, &2, &wallet);
    assert_eq!(id1.register(&dave), 3);
    id1.set_metadata(&dave, &3, &s("note"), &b(b"x"));
    id1.unset_agent_wallet(&dave, &3);
    let metadata = vec![&env, entry("name", b"Erin")];
    assert_eq!(id1.register_full(&erin, &s("ipfs://erin"), &metadata), 4);
    id1.transfer(&erin, &frank, &4); // clears agent 4's wallet and metadata
    let live_until = env.ledger().sequence() + 1_000_000;
    id1.approve(&bob, &operator, &1, &live_until);
    id1.approve_for_all(&carol, &operator, &live_until);
    id1.transfer_ownership(&new_admin, &live_until);

    // Reputation, on agent 1.
    let feedback = |client: &Address, agent: u32, value: i128, decimals: u32, n: u8| {
        rep1.give_feedback(
            client,
            &agent,
            &value,
            &decimals,
            &s("quality"),
            &s("uptime"),
            &s("https://bob.example"),
            &s("ipfs://feedback"),
            &h(n),
        )
    };
    feedback(&r1, 1, 90, 0, 1);
    feedback(&r1, 1, 9_977, 2, 2);
    feedback(&r2, 1, 70, 0, 3);
    rep1.revoke_feedback(&r2, &1, &1);
    rep1.append_response(&bob, &1, &r1, &1, &s("ipfs://reply"), &h(4));
    rep1.append_response(&responder, &1, &r1, &1, &s("ipfs://reply-2"), &h(5));
    // Records that v1 accepted and v2 rejects: a value that cannot be
    // normalized, and carol's bound wallet rating her agent 2.
    feedback(&r3, 1, 10i128.pow(30), 0, 6);
    feedback(&wallet, 2, 100, 0, 7);
    let clients = vec![&env, r1.clone(), r2.clone(), r3.clone()];
    assert!(rep1.try_get_summary(&1, &clients, &s(""), &s("")).is_err());
    let summary = rep1.get_summary(&1, &vec![&env, r1.clone(), r2.clone()], &s(""), &s(""));
    assert_eq!((summary.count, summary.summary_value), (2, 94)); // 94.885 floored

    // Validation, on agent 1. The last request names the owner as its own
    // validator, which v2 rejects.
    val1.validation_request(&bob, &validator_a, &1, &s("ipfs://req-a"), &h(10));
    val1.validation_response(
        &validator_a,
        &h(10),
        &80,
        &s("ipfs://a"),
        &h(11),
        &s("security"),
    );
    val1.validation_request(&operator, &validator_b, &1, &s("ipfs://req-b"), &h(12));
    val1.validation_request(&bob, &bob, &1, &s("ipfs://self"), &h(13));
    val1.validation_response(
        &bob,
        &h(13),
        &100,
        &s("ipfs://self"),
        &h(14),
        &s("security"),
    );

    // Upgrade all three with v1's timelocked functions, as on mainnet.
    let id_v2 = upload(&env, &v2_wasm("identity"));
    let rep_v2 = upload(&env, &v2_wasm("reputation"));
    let val_v2 = upload(&env, &v2_wasm("validation"));
    id1.propose_upgrade(&id_v2);
    rep1.propose_upgrade(&rep_v2);
    val1.propose_upgrade(&val_v2);
    assert_eq!(id1.pending_upgrade().map(|p| p.wasm_hash), Some(id_v2));
    advance(&env, TIMELOCK_LEDGERS);
    id1.execute_upgrade();
    rep1.execute_upgrade();
    val1.execute_upgrade();

    let id2 = IdentityRegistryContractClient::new(&env, &id);
    let rep2 = ReputationRegistryContractClient::new(&env, &rep);
    let val2 = ValidationRegistryContractClient::new(&env, &val);
    assert_eq!(
        [id2.version(), rep2.version(), val2.version()],
        [s("0.2.0"), s("0.2.0"), s("0.2.0")]
    );
    assert!(id2.pending_upgrade().is_none());
    assert!(rep2.pending_upgrade().is_none());
    assert!(val2.pending_upgrade().is_none());

    // Identity reads.
    assert_eq!(id2.get_owner(), Some(admin.clone()));
    assert_eq!(
        (id2.name(), id2.symbol()),
        (s("Agent Registry"), s("AGENT"))
    );
    assert_eq!(id2.total_agents(), 5);
    for (agent, owner) in [&alice, &bob, &carol, &dave, &frank]
        .into_iter()
        .enumerate()
    {
        assert_eq!(id2.owner_of(&(agent as u32)), *owner);
    }
    assert_eq!((id2.balance(&erin), id2.balance(&frank)), (0, 1));
    assert_eq!(id2.try_agent_uri(&0), Err(Ok(IdentityError::UriNotSet)));
    assert_eq!(id2.agent_uri(&1), s("ipfs://bob"));
    assert_eq!(id2.token_uri(&2), s("ipfs://carol"));
    assert_eq!(id2.get_agent_wallet(&0), Some(alice.clone()));
    assert_eq!(id2.get_agent_wallet(&2), Some(wallet.clone()));
    assert_eq!(id2.get_agent_wallet(&3), None);
    assert_eq!(id2.get_agent_wallet(&4), None);
    assert_eq!(id2.get_metadata(&2, &s("name")), Some(b(b"Carol")));
    assert_eq!(id2.get_metadata(&2, &s("skills")), Some(b(b"search")));
    assert_eq!(id2.get_metadata(&3, &s("note")), Some(b(b"x")));
    assert_eq!(id2.get_metadata(&4, &s("name")), None);
    assert_eq!(id2.get_approved(&1), Some(operator.clone()));
    assert!(id2.is_approved_for_all(&carol, &operator));
    assert!(id2.is_authorized_or_owner(&operator, &2));

    // Reputation reads, including the records v2 would reject.
    assert_eq!(rep2.get_identity_registry(), id);
    assert_eq!(rep2.get_owner(), Some(admin.clone()));
    let fb = rep2.read_feedback(&1, &r1, &2);
    assert_eq!(
        (fb.value, fb.value_decimals, fb.is_revoked, fb.tag1, fb.tag2),
        (9_977, 2, false, s("quality"), s("uptime"))
    );
    assert!(rep2.read_feedback(&1, &r2, &1).is_revoked);
    assert_eq!(rep2.read_feedback(&1, &r3, &1).value, 10i128.pow(30));
    assert_eq!(rep2.read_feedback(&2, &wallet, &1).value, 100);
    assert_eq!(rep2.get_last_index(&1, &r1), 2);
    assert_eq!(rep2.get_response_count(&1, &r1, &1), 2);
    assert_eq!(rep2.get_clients_paginated(&1, &0, &10), clients);
    // v2 skips the entry it cannot normalize and rounds once: 94.885 -> 95.
    let summary = rep2.get_summary(&1, &clients, &s(""), &s(""));
    assert_eq!(
        (
            summary.count,
            summary.summary_value,
            summary.summary_value_decimals
        ),
        (2, 95, 0)
    );

    // Validation reads.
    assert_eq!(val2.get_identity_registry(), id);
    assert_eq!(val2.get_owner(), Some(admin.clone()));
    let a = val2.get_validation_status(&h(10));
    assert_eq!(
        (
            a.validator_address,
            a.agent_id,
            a.response,
            a.response_hash,
            a.tag,
            a.has_response
        ),
        (validator_a.clone(), 1, 80, h(11), s("security"), true)
    );
    let b_status = val2.get_validation_status(&h(12));
    assert_eq!(
        (b_status.validator_address, b_status.has_response),
        (validator_b.clone(), false)
    );
    assert_eq!(
        val2.get_agent_validations_paginated(&1, &0, &10),
        vec![&env, h(10), h(12), h(13)]
    );
    assert_eq!(
        val2.get_validator_requests_paginated(&validator_a, &0, &10),
        vec![&env, h(10)]
    );
    // v1 did not index answers and v2 has no backfill: answers given under
    // v1 are not counted after the upgrade until their validator updates them.
    let summary_of = |validators: soroban_sdk::Vec<Address>| {
        let summary = val2.get_summary(&1, &validators, &s("security"));
        (summary.count, summary.average_response)
    };
    let only_a = vec![&env, validator_a.clone()];
    assert_eq!(summary_of(only_a.clone()), (0, 0));
    assert_eq!(summary_of(vec![&env]), (0, 0));
    val2.validation_response(
        &validator_a,
        &h(10),
        &70,
        &s("ipfs://a-2"),
        &h(18),
        &s("security"),
    );
    assert_eq!(summary_of(only_a.clone()), (1, 70));
    // More unanswered requests than the summary window holds do not push
    // the answer out, filtered or not.
    for n in 100..140 {
        val2.validation_request(&bob, &validator_b, &1, &s(""), &h(n));
    }
    assert_eq!(summary_of(only_a.clone()), (1, 70));
    assert_eq!(summary_of(vec![&env]), (1, 70));

    // Writes on v1 records through v2. Records v2 would reject stay
    // revocable, respondable and answerable; new ones are refused.
    rep2.revoke_feedback(&r3, &1, &1);
    rep2.append_response(&bob, &1, &r3, &1, &s("ipfs://late"), &h(8));
    rep2.revoke_feedback(&wallet, &2, &1);
    assert_eq!(
        rep2.try_give_feedback(&wallet, &2, &100, &0, &s(""), &s(""), &s(""), &s(""), &h(9)),
        Err(Ok(ReputationError::SelfFeedback))
    );
    rep2.give_feedback(&r1, &1, &60, &0, &s(""), &s(""), &s(""), &s(""), &h(9));
    assert_eq!(rep2.get_last_index(&1, &r1), 3);
    val2.validation_response(
        &bob,
        &h(13),
        &90,
        &s("ipfs://self-2"),
        &h(15),
        &s("security"),
    );
    assert_eq!(val2.get_validation_status(&h(13)).response, 90);
    // Updating a v1 answer indexes it, here bob's self-validation.
    assert_eq!(summary_of(vec![&env]), (2, 80));
    val2.validation_response(&validator_b, &h(12), &60, &s("ipfs://b"), &h(16), &s(""));
    assert_eq!(
        val2.try_validation_request(&bob, &bob, &1, &s(""), &h(17)),
        Err(Ok(ValidationError::ValidatorNotIndependent))
    );
    id2.set_metadata(&carol, &2, &s("name"), &b(b"Carol 2"));
    assert_eq!(id2.get_metadata(&2, &s("name")), Some(b(b"Carol 2")));
    id2.extend_ttl(&2);
    id2.transfer_from(&operator, &bob, &erin, &1); // single-token approval from v1
    assert_eq!(id2.owner_of(&1), erin);
    assert_eq!(id2.get_agent_wallet(&1), None);
    let metadata = vec![
        &env,
        MetadataEntry {
            key: s("name"),
            value: b(b"R1"),
        },
    ];
    assert_eq!(id2.register_full(&r1, &s("ipfs://r1"), &metadata), 5);
    id2.accept_ownership(); // ownership transfer started under v1
    assert_eq!(id2.get_owner(), Some(new_admin));
}
