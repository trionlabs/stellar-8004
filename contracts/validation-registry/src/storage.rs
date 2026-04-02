use soroban_sdk::{contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    IdentityRegistry,
    Validation(BytesN<32>),
    AgentValidationCount(u32),
    AgentValidationAt(u32, u32),
    ValidatorRequestCount(Address),
    ValidatorRequestAt(Address, u32),
}
