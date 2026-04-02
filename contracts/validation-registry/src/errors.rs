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
    AlreadyResponded = 6,
}
