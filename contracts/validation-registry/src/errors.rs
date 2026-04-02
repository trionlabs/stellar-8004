use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ValidationError {
    NotOwnerOrApproved = 1,
    AgentNotFound = 2,
    RequestNotFound = 3,
    InvalidResponse = 4,
}
