//! Upgrade tests from the WASM deployed on mainnet (`mainnet-v1/`, pinned by
//! sha256) to the v2 WASM built from this workspace. `make test` builds the
//! v2 WASM before running them.
#![cfg(test)]
extern crate std;

mod events;
mod storage_compat;
mod upgrade_path;

use soroban_sdk::{
    testutils::{EnvTestConfig, Ledger as _},
    xdr, Address, Bytes, BytesN, Env,
};
use std::{format, string::String, vec::Vec};

#[allow(clippy::too_many_arguments)]
mod v1 {
    pub mod identity {
        soroban_sdk::contractimport!(
            file = "mainnet-v1/identity_registry.wasm",
            sha256 = "f25af88f3e26f603a6569b2554b3f85ccc8af9a88f3b904fba873637c64eb2ab"
        );
    }
    pub mod reputation {
        soroban_sdk::contractimport!(
            file = "mainnet-v1/reputation_registry.wasm",
            sha256 = "74af1a031934346260f7265dacb633209dba507c1416f1e37d52405b53478f71"
        );
    }
    pub mod validation {
        soroban_sdk::contractimport!(
            file = "mainnet-v1/validation_registry.wasm",
            sha256 = "9e5d7dc78ca00fc7c7afc914a0b3ecbcec61b4e7b1893a84bf47c3b811c68aa1"
        );
    }
}

const TIMELOCK_LEDGERS: u32 = 51_840;

/// The v2 WASM of `contract` ("identity", "reputation" or "validation"),
/// from `WASM_DIR` (relative to the workspace root), by default the output
/// of `make build`.
fn v2_wasm(contract: &str) -> Vec<u8> {
    let dir = std::env::var("WASM_DIR").unwrap_or("target/wasm32v1-none/release".into());
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(dir)
        .join(format!("{contract}_registry.wasm"));
    std::fs::read(&path).unwrap_or_else(|err| panic!("{}: {err}; run `make test`", path.display()))
}

fn upload(env: &Env, wasm: &[u8]) -> BytesN<32> {
    env.deployer()
        .upload_contract_wasm(Bytes::from_slice(env, wasm))
}

/// Mainnet's ledger height and TTL settings. No snapshot file, which would
/// embed every WASM.
fn mainnet_env() -> Env {
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number = 65_000_000;
        ledger.min_temp_entry_ttl = 17_280;
        ledger.min_persistent_entry_ttl = 2_073_600;
        ledger.max_entry_ttl = 3_110_400;
    });
    env.mock_all_auths();
    env
}

fn advance(env: &Env, ledgers: u32) {
    env.ledger()
        .with_mut(|ledger| ledger.sequence_number += ledgers);
}

/// Events the last invocation emitted from `contract`.
fn events_of(env: &Env, contract: &Address) -> Vec<xdr::ContractEvent> {
    use soroban_sdk::testutils::Events as _;
    env.events()
        .all()
        .filter_by_contract(contract)
        .events()
        .to_vec()
}

/// The layout the indexer parses: `name(topic types){data key:type, ...}`.
fn shape(event: &xdr::ContractEvent) -> String {
    let xdr::ContractEventBody::V0(body) = &event.body;
    let mut topics = body.topics.iter();
    let Some(xdr::ScVal::Symbol(name)) = topics.next() else {
        panic!("event without a name topic: {event:?}");
    };
    let topics: Vec<&str> = topics.map(kind).collect();
    let xdr::ScVal::Map(Some(data)) = &body.data else {
        panic!("event data is not a map: {event:?}");
    };
    let data: Vec<String> = data
        .iter()
        .map(|entry| match &entry.key {
            xdr::ScVal::Symbol(key) => {
                format!("{}:{}", key.to_utf8_string_lossy(), kind(&entry.val))
            }
            other => panic!("non-symbol data key {other:?}"),
        })
        .collect();
    format!(
        "{}({}){{{}}}",
        name.to_utf8_string_lossy(),
        topics.join(","),
        data.join(",")
    )
}

fn kind(value: &xdr::ScVal) -> &'static str {
    match value {
        xdr::ScVal::U32(_) => "u32",
        xdr::ScVal::U64(_) => "u64",
        xdr::ScVal::I128(_) => "i128",
        xdr::ScVal::Address(_) => "address",
        xdr::ScVal::String(_) => "string",
        xdr::ScVal::Bytes(_) => "bytes",
        xdr::ScVal::Symbol(_) => "symbol",
        other => panic!("unexpected event value {other:?}"),
    }
}
