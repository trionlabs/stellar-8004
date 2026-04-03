export type { Database } from "./types.js";

import type { Database } from "./types.js";

type Tables = Database["public"]["Tables"];

export type Agent = Tables["agents"]["Row"];
export type AgentInsert = Tables["agents"]["Insert"];
export type AgentMetadata = Tables["agent_metadata"]["Row"];
export type Feedback = Tables["feedback"]["Row"];
export type FeedbackInsert = Tables["feedback"]["Insert"];
export type FeedbackResponse = Tables["feedback_responses"]["Row"];
export type Validation = Tables["validations"]["Row"];
export type ValidationInsert = Tables["validations"]["Insert"];
export type IndexerState = Tables["indexer_state"]["Row"];
