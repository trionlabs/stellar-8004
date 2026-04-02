use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    AgentUri(u32),
    Metadata(u32, soroban_sdk::String),
    AgentWallet(u32),
}
