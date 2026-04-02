use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum IdentityError {
    NotOwnerOrApproved = 1,
    AgentNotFound = 2,
    InvalidDeadline = 3,
    InvalidSignature = 4,
    WalletNotSet = 5,
    UriNotSet = 6,
}
