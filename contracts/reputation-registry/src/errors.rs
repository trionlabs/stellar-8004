use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    /// ERC-8004 spec: `giveFeedback` MUST reject the agent owner and any
    /// approved operator. Surfaces a distinguishable code so callers can
    /// special-case the self-feedback path in their UI.
    SelfFeedback = 1,
    FeedbackNotFound = 2,
    InvalidValueDecimals = 3,
    /// Retained for binding ABI stability. Was returned when
    /// `append_response` was owner-restricted; now open to anyone per spec.
    NotOwnerOrApproved = 4,
    AggregateOverflow = 5,
    AgentNotFound = 6,
    /// ERC-8004 reference: empty response URIs are rejected.
    EmptyValue = 7,
    /// ERC-8004 spec: `value` must be in `[-1e38, 1e38]`. Bounds the
    /// summary normalization arithmetic against single-feedback overflow.
    ValueOutOfRange = 8,
    /// ERC-8004 spec: `getSummary` MUST be called with a non-empty client
    /// list - all-clients aggregates are a Sybil/spam vector by design.
    /// Off-chain consumers compute agent-wide scores via the explorer DB.
    ClientAddressesRequired = 9,
}
