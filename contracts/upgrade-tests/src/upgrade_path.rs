//! The timelocked upgrade of every registry: mainnet v1 to v2 through v1's
//! own functions, then v2's functions and events, and back to the mainnet
//! code to show that v2 can still be upgraded.
use identity_registry::{errors::IdentityError, storage::UpgradeProposal};
use reputation_registry::errors::ReputationError;
use soroban_sdk::{
    map, testutils::Address as _, testutils::Events as _, vec, Address, BytesN, Env, Error,
    IntoVal, Map, String, Symbol, TryFromVal, Val, Vec,
};
use validation_registry::errors::ValidationError;

use crate::{advance, mainnet_env, upload, v1, v2_wasm, TIMELOCK_LEDGERS};

struct Registry {
    name: &'static str,
    v1: &'static [u8],
    no_upgrade_proposed: u32,
    timelock_not_expired: u32,
    upgrade_already_proposed: u32,
}

const REGISTRIES: [Registry; 3] = [
    Registry {
        name: "identity",
        v1: v1::identity::WASM,
        no_upgrade_proposed: IdentityError::NoUpgradeProposed as u32,
        timelock_not_expired: IdentityError::TimelockNotExpired as u32,
        upgrade_already_proposed: IdentityError::UpgradeAlreadyProposed as u32,
    },
    Registry {
        name: "reputation",
        v1: v1::reputation::WASM,
        no_upgrade_proposed: ReputationError::NoUpgradeProposed as u32,
        timelock_not_expired: ReputationError::TimelockNotExpired as u32,
        upgrade_already_proposed: ReputationError::UpgradeAlreadyProposed as u32,
    },
    Registry {
        name: "validation",
        v1: v1::validation::WASM,
        no_upgrade_proposed: ValidationError::NoUpgradeProposed as u32,
        timelock_not_expired: ValidationError::TimelockNotExpired as u32,
        upgrade_already_proposed: ValidationError::UpgradeAlreadyProposed as u32,
    },
];

fn deploy_v1(env: &Env, registry: &Registry) -> Address {
    let owner = Address::generate(env);
    let args: Vec<Val> = if registry.name == "identity" {
        vec![
            env,
            owner.into_val(env),
            String::from_str(env, "Agent Registry").into_val(env),
            String::from_str(env, "AGENT").into_val(env),
        ]
    } else {
        vec![
            env,
            owner.into_val(env),
            Address::generate(env).into_val(env),
        ]
    };
    env.register(registry.v1, args)
}

fn call<T: TryFromVal<Env, Val>>(env: &Env, contract: &Address, func: &str, args: Vec<Val>) -> T {
    env.invoke_contract(contract, &Symbol::new(env, func), args)
}

/// The contract error code of a failing call.
fn error_of(env: &Env, contract: &Address, func: &str, args: Vec<Val>) -> Error {
    match env.try_invoke_contract::<Val, Error>(contract, &Symbol::new(env, func), args) {
        Err(Ok(error)) => error,
        other => panic!("{func} should fail with a contract error, got {other:?}"),
    }
}

fn version(env: &Env, contract: &Address) -> String {
    call(env, contract, "version", vec![env])
}

fn pending(env: &Env, contract: &Address) -> Option<UpgradeProposal> {
    call(env, contract, "pending_upgrade", vec![env])
}

fn hash_arg(env: &Env, hash: &BytesN<32>) -> Vec<Val> {
    vec![env, hash.into_val(env)]
}

/// A single event named `name` with `data`, as the contract publishes it.
fn event(
    env: &Env,
    contract: &Address,
    name: &str,
    data: Map<Symbol, Val>,
) -> Vec<(Address, Vec<Val>, Val)> {
    vec![
        env,
        (
            contract.clone(),
            vec![env, Symbol::new(env, name).into_val(env)],
            data.into_val(env),
        ),
    ]
}

fn wasm_hash_data(env: &Env, hash: &BytesN<32>) -> Map<Symbol, Val> {
    map![env, (Symbol::new(env, "wasm_hash"), hash.into_val(env))]
}

#[test]
fn timelocked_upgrade_mainnet_v1_to_v2_and_on() {
    for registry in &REGISTRIES {
        let env = mainnet_env();
        let contract = deploy_v1(&env, registry);
        let v1_hash = upload(&env, registry.v1);
        let v2_hash = upload(&env, &v2_wasm(registry.name));
        let no_args = || vec![&env];
        let contract_error = Error::from_contract_error;

        // v1 to v2 with v1's own functions, as it will run on mainnet.
        assert_eq!(version(&env, &contract), String::from_str(&env, "0.1.0"));
        call::<()>(&env, &contract, "propose_upgrade", hash_arg(&env, &v2_hash));
        advance(&env, TIMELOCK_LEDGERS - 1);
        assert_eq!(
            error_of(&env, &contract, "execute_upgrade", no_args()),
            contract_error(registry.timelock_not_expired)
        );
        advance(&env, 1);
        call::<()>(&env, &contract, "execute_upgrade", no_args());
        assert_eq!(version(&env, &contract), String::from_str(&env, "0.2.0"));
        assert!(pending(&env, &contract).is_none());

        // v2: propose, reject a second proposal, cancel.
        let proposed_at = env.ledger().sequence();
        call::<()>(&env, &contract, "propose_upgrade", hash_arg(&env, &v1_hash));
        assert_eq!(
            env.events().all().filter_by_contract(&contract),
            event(
                &env,
                &contract,
                "upgrade_proposed",
                map![
                    &env,
                    (
                        Symbol::new(&env, "executable_at"),
                        (proposed_at + TIMELOCK_LEDGERS).into_val(&env)
                    ),
                    (Symbol::new(&env, "wasm_hash"), v1_hash.into_val(&env))
                ]
            ),
            "{}",
            registry.name
        );
        let stored = pending(&env, &contract).expect("pending upgrade");
        assert_eq!(
            (stored.wasm_hash, stored.proposed_at),
            (v1_hash.clone(), proposed_at)
        );
        assert_eq!(
            error_of(&env, &contract, "propose_upgrade", hash_arg(&env, &v2_hash)),
            contract_error(registry.upgrade_already_proposed)
        );
        call::<()>(&env, &contract, "cancel_upgrade", no_args());
        assert_eq!(
            env.events().all().filter_by_contract(&contract),
            event(
                &env,
                &contract,
                "upgrade_cancelled",
                wasm_hash_data(&env, &v1_hash)
            )
        );
        assert!(pending(&env, &contract).is_none());
        for func in ["cancel_upgrade", "execute_upgrade"] {
            assert_eq!(
                error_of(&env, &contract, func, no_args()),
                contract_error(registry.no_upgrade_proposed)
            );
        }

        // v2 executes after exactly TIMELOCK_LEDGERS. The target here is the
        // mainnet v1 code: getting it back proves v2 can still be upgraded.
        call::<()>(&env, &contract, "propose_upgrade", hash_arg(&env, &v1_hash));
        advance(&env, TIMELOCK_LEDGERS - 1);
        assert_eq!(
            error_of(&env, &contract, "execute_upgrade", no_args()),
            contract_error(registry.timelock_not_expired)
        );
        advance(&env, 1);
        call::<()>(&env, &contract, "execute_upgrade", no_args());
        assert_eq!(
            env.events().all().filter_by_contract(&contract),
            event(
                &env,
                &contract,
                "upgrade_executed",
                wasm_hash_data(&env, &v1_hash)
            )
        );
        assert_eq!(version(&env, &contract), String::from_str(&env, "0.1.0"));
    }
}

#[test]
fn v2_reads_a_pending_upgrade_stored_by_v1() {
    for registry in &REGISTRIES {
        let env = mainnet_env();
        let contract = deploy_v1(&env, registry);
        let v2_hash = upload(&env, &v2_wasm(registry.name));
        let proposed_at = env.ledger().sequence();
        call::<()>(&env, &contract, "propose_upgrade", hash_arg(&env, &v2_hash));

        // Install v2 without consuming the proposal, so v2 has to decode the
        // proposal v1 stored.
        env.as_contract(&contract, || {
            env.deployer().update_current_contract_wasm(v2_hash.clone())
        });
        assert_eq!(version(&env, &contract), String::from_str(&env, "0.2.0"));
        let stored = pending(&env, &contract).expect("pending upgrade");
        assert_eq!(
            (stored.wasm_hash, stored.proposed_at),
            (v2_hash.clone(), proposed_at)
        );

        advance(&env, TIMELOCK_LEDGERS);
        call::<()>(&env, &contract, "execute_upgrade", vec![&env]);
        assert_eq!(
            env.events().all().filter_by_contract(&contract),
            event(
                &env,
                &contract,
                "upgrade_executed",
                wasm_hash_data(&env, &v2_hash)
            )
        );
        assert!(pending(&env, &contract).is_none());
    }
}
