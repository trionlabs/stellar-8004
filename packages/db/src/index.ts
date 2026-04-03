export type { Database } from "./types.js";

import type { Database } from "./types.js";

type Tables = Database["public"]["Tables"];

export type Agent = Tables["agents"]["Row"];
export type AgentInsert = Tables["agents"]["Insert"];
export type AgentMetadata = Tables["agent_metadata"]["Row"];
export type FeedbackResponse = Tables["feedback_responses"]["Row"];
export type Validation = Tables["validations"]["Row"];
export type ValidationInsert = Tables["validations"]["Insert"];
export type IndexerState = Tables["indexer_state"]["Row"];

// Supabase generates numeric/bigint as `number`, but these columns exceed
// JS Number.MAX_SAFE_INTEGER range. Override with string for safe handling.
// The indexer should read these as strings and parse with BigInt where needed.
export type Feedback = Omit<Tables["feedback"]["Row"], "value"> & {
  value: string; // numeric(39,18) — too large for JS number
};
export type FeedbackInsert = Omit<Tables["feedback"]["Insert"], "value"> & {
  value: string;
};
