use soroban_sdk::{contract, contractimpl, Env, String};

#[contract]
pub struct IdentityRegistryContract;

#[contractimpl]
impl IdentityRegistryContract {
    pub fn version(e: Env) -> String {
        String::from_str(&e, "0.1.0")
    }
}
