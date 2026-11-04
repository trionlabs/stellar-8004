//! The events the indexer parses keep the exact layout of the mainnet v1
//! code: the same calls on v1 and v2 emit identical topics and data.
use identity_registry::{contract::IdentityRegistryContractClient, types::MetadataEntry};
use reputation_registry::contract::ReputationRegistryContractClient;
use soroban_sdk::{testutils::Address as _, vec, xdr, Address, Bytes, BytesN, Env, String};
use std::vec::Vec;
use validation_registry::contract::ValidationRegistryContractClient;

use crate::{events_of, mainnet_env, shape, v1, v2_wasm};

struct Registries<'a> {
    identity: IdentityRegistryContractClient<'a>,
    reputation: ReputationRegistryContractClient<'a>,
    validation: ValidationRegistryContractClient<'a>,
}

fn deploy<'a>(env: &'a Env, admin: &Address, wasm: [&[u8]; 3]) -> Registries<'a> {
    let [identity, reputation, validation] = wasm;
    let name = String::from_str(env, "Agent Registry");
    let identity = env.register(
        identity,
        (admin.clone(), name, String::from_str(env, "AGENT")),
    );
    let reputation = env.register(reputation, (admin.clone(), identity.clone()));
    let validation = env.register(validation, (admin.clone(), identity.clone()));
    Registries {
        identity: IdentityRegistryContractClient::new(env, &identity),
        reputation: ReputationRegistryContractClient::new(env, &reputation),
        validation: ValidationRegistryContractClient::new(env, &validation),
    }
}

/// Runs every call that emits an indexed event and returns, per call, the
/// layout of each event and the events themselves.
fn emit_all(
    env: &Env,
    r: &Registries,
    users: &[Address; 6],
) -> Vec<(Vec<std::string::String>, Vec<xdr::ContractEventBody>)> {
    let [alice, bob, wallet, reviewer, validator, dave] = users;
    let s = |text: &str| String::from_str(env, text);
    let h = |n: u8| BytesN::from_array(env, &[n; 32]);
    let (id, rep, val) = (
        &r.identity.address,
        &r.reputation.address,
        &r.validation.address,
    );
    let mut out = Vec::new();
    let mut record = |contract: &Address| {
        let events = events_of(env, contract);
        out.push((
            events.iter().map(shape).collect(),
            events.into_iter().map(|e| e.body).collect(),
        ));
    };

    r.identity.register(alice);
    record(id);
    let metadata = vec![
        env,
        MetadataEntry {
            key: s("name"),
            value: Bytes::from_slice(env, b"Bob"),
        },
    ];
    r.identity.register_full(bob, &s("ipfs://bob"), &metadata);
    record(id);
    r.identity.set_agent_uri(alice, &0, &s("ipfs://alice"));
    record(id);
    r.identity
        .set_metadata(alice, &0, &s("skills"), &Bytes::from_slice(env, b"search"));
    record(id);
    r.identity.set_agent_wallet(alice, &0, wallet);
    record(id);
    r.identity.unset_agent_wallet(alice, &0);
    record(id);
    r.identity.transfer(bob, dave, &1);
    record(id);
    r.reputation.give_feedback(
        reviewer,
        &0,
        &-9_977,
        &2,
        &s("uptime"),
        &s("day"),
        &s("https://alice.example"),
        &s("ipfs://feedback"),
        &h(1),
    );
    record(rep);
    r.reputation
        .append_response(alice, &0, reviewer, &1, &s("ipfs://reply"), &h(2));
    record(rep);
    r.reputation.revoke_feedback(reviewer, &0, &1);
    record(rep);
    r.validation
        .validation_request(alice, validator, &0, &s("ipfs://request"), &h(3));
    record(val);
    r.validation.validation_response(
        validator,
        &h(3),
        &80,
        &s("ipfs://response"),
        &h(4),
        &s("security"),
    );
    record(val);
    out
}

#[test]
fn indexed_events_match_mainnet_v1() {
    let env = mainnet_env();
    let admin = Address::generate(&env);
    let users = [(); 6].map(|_| Address::generate(&env));
    let v2 = [
        v2_wasm("identity"),
        v2_wasm("reputation"),
        v2_wasm("validation"),
    ];
    let v1 = deploy(
        &env,
        &admin,
        [
            v1::identity::WASM,
            v1::reputation::WASM,
            v1::validation::WASM,
        ],
    );
    let v2 = deploy(&env, &admin, [&v2[0], &v2[1], &v2[2]]);
    assert_eq!(v2.identity.version(), String::from_str(&env, "0.2.0"));

    let v1_events = emit_all(&env, &v1, &users);
    let v2_events = emit_all(&env, &v2, &users);
    for (step, (v1_step, v2_step)) in v1_events.iter().zip(&v2_events).enumerate() {
        assert_eq!(
            v1_step.1, v2_step.1,
            "events of call {step} differ from mainnet v1"
        );
    }

    // What webapp/packages/indexer/src/parsers reads from each event.
    let mint = "mint(address){token_id:u32}";
    let wallet_set = "metadata_set(u32,string){value:bytes}";
    let expected: [&[&str]; 12] = [
        &[
            mint,
            wallet_set,
            "registered(u32,address){agent_uri:string}",
        ],
        &[
            mint,
            wallet_set,
            wallet_set,
            "registered(u32,address){agent_uri:string}",
        ],
        &["uri_updated(u32,address){new_uri:string}"],
        &[wallet_set],
        &[wallet_set],
        &[wallet_set],
        &[wallet_set, "transfer(address,address){token_id:u32}"],
        &[
            "new_feedback(u32,address,string){endpoint:string,feedback_hash:bytes,\
           feedback_index:u64,feedback_uri:string,tag2:string,value:i128,value_decimals:u32}",
        ],
        &[
            "response_appended(u32,address,address){feedback_index:u64,response_hash:bytes,\
           response_uri:string}",
        ],
        &["feedback_revoked(u32,address,u64){}"],
        &["validation_request(address,u32,bytes){request_uri:string}"],
        &[
            "validation_response(address,u32,bytes){response:u32,response_hash:bytes,\
           response_uri:string,tag:string}",
        ],
    ];
    assert_eq!(v2_events.len(), expected.len());
    for ((shapes, _), expected) in v2_events.iter().zip(expected) {
        assert_eq!(shapes, expected);
    }
}
