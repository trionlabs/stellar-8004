use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    SelfFeedback = 1,
    FeedbackNotFound = 2,
    InvalidValueDecimals = 3,
    NotOwnerOrApproved = 4,
    AggregateOverflow = 5,
}
