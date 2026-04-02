use soroban_sdk::{contract, contractimpl, Env, String};

#[contract]
pub struct ValidationRegistryContract;

#[contractimpl]
impl ValidationRegistryContract {
    pub fn version(e: Env) -> String {
        String::from_str(&e, "0.1.0")
    }
}
