use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum IdentityError {
    NotOwnerOrApproved = 1,
    UriNotSet = 2,
    AgentNotFound = 3,
}
