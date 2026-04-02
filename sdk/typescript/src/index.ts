import { Networks, rpc, scValToNative } from "@stellar/stellar-sdk";

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  identityRegistryId: string;
  reputationRegistryId: string;
  validationRegistryId: string;
}

export const TESTNET: NetworkConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  identityRegistryId: "CAYPUQB3XGXJ76N4H32TUQE2FHJ65BZN62Q2JVMC6U5NWJBUYHNDGALT",
  reputationRegistryId: "CACIFRSDXQ5BQDWN6UNKH65IFA2ALRMLVQWRK33EXZYVYOS32TLUP5UG",
  validationRegistryId: "CDOTQZMJZEWIEWMFQS3HIQBM4WIJANHSYQKMOWMJP6UL6EIZXXVNSD6Y",
};

export interface FeedbackEntry {
  agentId: number;
  clientAddress: string;
  feedbackIndex: number;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackUri: string;
  feedbackHash: string;
  ledger: number;
  txHash: string;
}

export function agentIdentifier(
  config: NetworkConfig,
  agentId: number,
): string {
  return `stellar:testnet:${config.identityRegistryId}#${agentId}`;
}

export interface ReadAllFeedbackOptions {
  startLedger?: number;
}

export async function readAllFeedback(
  config: NetworkConfig,
  agentId: number,
  options?: ReadAllFeedbackOptions,
): Promise<FeedbackEntry[]> {
  const server = new rpc.Server(config.rpcUrl);
  const entries: FeedbackEntry[] = [];

  // Determine start ledger - use provided, or query the oldest available
  let startLedger = options?.startLedger;
  if (!startLedger) {
    const latest = await server.getLatestLedger();
    // RPC retains ~7 days of events. Use oldest available ledger.
    // getLatestLedger returns the latest; we go back ~120k ledgers (~7 days at 5s)
    startLedger = Math.max(1, latest.sequence - 120_000);
  }

  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params: rpc.Server.GetEventsRequest = {
      filters: [
        {
          type: "contract",
          contractIds: [config.reputationRegistryId],
        },
      ],
      limit: 100,
    };

    if (cursor) {
      params.cursor = cursor;
    } else {
      params.startLedger = startLedger;
    }

    const response = await server.getEvents(params);

    for (const event of response.events) {
      try {
        const topicName = scValToNative(event.topic[0]);
        if (topicName !== "new_feedback") continue;

        const eventAgentId = Number(scValToNative(event.topic[1]));
        if (eventAgentId !== agentId) continue;

        const clientAddress = scValToNative(event.topic[2]) as string;
        const data = scValToNative(event.value) as Record<string, unknown>;

        entries.push({
          agentId: eventAgentId,
          clientAddress,
          feedbackIndex: Number(data.feedback_index ?? 0),
          value: BigInt(String(data.value ?? "0")),
          valueDecimals: Number(data.value_decimals ?? 0),
          tag1: String(data.tag1 ?? ""),
          tag2: String(data.tag2 ?? ""),
          endpoint: String(data.endpoint ?? ""),
          feedbackUri: String(data.feedback_uri ?? ""),
          feedbackHash: String(data.feedback_hash ?? ""),
          ledger: event.ledger,
          txHash: event.txHash,
        });
      } catch {
        // Skip unparseable events
      }
    }

    if (response.events.length < 100) {
      hasMore = false;
    } else {
      const lastEvent = response.events[response.events.length - 1];
      cursor = lastEvent.pagingToken;
    }
  }

  return entries;
}
