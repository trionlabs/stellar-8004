use soroban_sdk::{contract, contractimpl, Env, String};

#[contract]
pub struct ReputationRegistryContract;

#[contractimpl]
impl ReputationRegistryContract {
    pub fn version(e: Env) -> String {
        String::from_str(&e, "0.1.0")
    }
}
