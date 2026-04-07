use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum IdentityError {
    NotOwnerOrApproved = 1,
    UriNotSet = 2,
    AgentNotFound = 3,
    MetadataKeyTooLong = 4,
    MetadataValueTooLong = 5,
    TooManyMetadataKeys = 6,
    /// ERC-8004 spec: `agentWallet` is a reserved metadata key. It cannot
    /// be set via `setMetadata()` or during `register()`. Use the dedicated
    /// `set_agent_wallet` entry point instead.
    ReservedMetadataKey = 7,
    /// ERC-8004 spec: `setMetadata`, `setAgentURI`, and `register*` reject
    /// empty keys / URIs. Match the reference implementation.
    EmptyValue = 8,
}
