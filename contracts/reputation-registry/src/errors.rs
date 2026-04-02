use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    SelfFeedback = 1,
    FeedbackNotFound = 2,
    NotFeedbackAuthor = 3,
    InvalidValueDecimals = 4,
    NotOwnerOrApproved = 5,
    AgentNotFound = 6,
}
