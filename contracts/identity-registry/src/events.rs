use soroban_sdk::{Address, Bytes, Env, String};

pub fn registered(e: &Env, agent_id: u32, owner: &Address, agent_uri: &String) {
    let _ = (e, agent_id, owner, agent_uri);
}

pub fn uri_updated(e: &Env, agent_id: u32, updated_by: &Address, new_uri: &String) {
    let _ = (e, agent_id, updated_by, new_uri);
}

pub fn metadata_set(e: &Env, agent_id: u32, key: &String, value: &Bytes) {
    let _ = (e, agent_id, key, value);
}
