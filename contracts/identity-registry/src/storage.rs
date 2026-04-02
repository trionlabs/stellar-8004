use soroban_sdk::{contracttype, Address, Bytes, Env, String};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    AgentUri(u32),
    Metadata(u32, String),
    AgentWallet(u32),
}

// --- Agent URI ---

pub fn set_agent_uri(e: &Env, agent_id: u32, uri: &String) {
    e.storage()
        .persistent()
        .set(&DataKey::AgentUri(agent_id), uri);
}

pub fn get_agent_uri(e: &Env, agent_id: u32) -> Option<String> {
    e.storage()
        .persistent()
        .get(&DataKey::AgentUri(agent_id))
}

pub fn has_agent_uri(e: &Env, agent_id: u32) -> bool {
    e.storage()
        .persistent()
        .has(&DataKey::AgentUri(agent_id))
}

// --- Agent Metadata ---

pub fn set_metadata(e: &Env, agent_id: u32, key: &String, value: &Bytes) {
    e.storage()
        .persistent()
        .set(&DataKey::Metadata(agent_id, key.clone()), value);
}

pub fn get_metadata(e: &Env, agent_id: u32, key: &String) -> Option<Bytes> {
    e.storage()
        .persistent()
        .get(&DataKey::Metadata(agent_id, key.clone()))
}

// --- Agent Wallet ---

pub fn set_agent_wallet(e: &Env, agent_id: u32, wallet: &Address) {
    e.storage()
        .persistent()
        .set(&DataKey::AgentWallet(agent_id), wallet);
}

pub fn get_agent_wallet(e: &Env, agent_id: u32) -> Option<Address> {
    e.storage()
        .persistent()
        .get(&DataKey::AgentWallet(agent_id))
}

pub fn remove_agent_wallet(e: &Env, agent_id: u32) {
    e.storage()
        .persistent()
        .remove(&DataKey::AgentWallet(agent_id));
}
