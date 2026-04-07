use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    /// Reserved variant. The Jan 2026 ERC-8004 update removed the
    /// self-feedback restriction; this code is no longer raised. Kept for
    /// binding ABI stability.
    SelfFeedback = 1,
    FeedbackNotFound = 2,
    InvalidValueDecimals = 3,
    NotOwnerOrApproved = 4,
    AggregateOverflow = 5,
    AgentNotFound = 6,
    /// ERC-8004 reference: empty response URIs are rejected.
    EmptyValue = 7,
}
