use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ValidationError {
    NotOwnerOrApproved = 1,
    RequestNotFound = 2,
    InvalidResponse = 3,
    RequestAlreadyExists = 4,
    NotDesignatedValidator = 5,
    /// Retained for binding ABI stability. The spec allows multiple
    /// responses per requestHash (progressive validation states).
    AlreadyResponded = 6,
    AgentNotFound = 7,
    CounterOverflow = 8,
}
