import { Networks, rpc, xdr, scValToNative } from "@stellar/stellar-sdk";

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
  isRevoked: boolean;
}

export function agentIdentifier(
  config: NetworkConfig,
  agentId: number,
): string {
  return `stellar:testnet:${config.identityRegistryId}#${agentId}`;
}

export async function readAllFeedback(
  config: NetworkConfig,
  agentId: number,
): Promise<FeedbackEntry[]> {
  const server = new rpc.Server(config.rpcUrl);
  const entries: FeedbackEntry[] = [];

  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await server.getEvents({
      startLedger: cursor ? undefined : 1,
      cursor: cursor,
      filters: [
        {
          type: "contract",
          contractIds: [config.reputationRegistryId],
        },
      ],
      limit: 100,
    });

    for (const event of response.events) {
      try {
        const topicSym = scValToNative(event.topic[0]);
        if (topicSym === "NewFeedback" || topicSym === "new_feedback") {
          entries.push(parseNewFeedbackEvent(event, agentId));
        }
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

  return entries.filter((e) => e.agentId === agentId);
}

function parseNewFeedbackEvent(event: rpc.Api.EventResponse, _agentId: number): FeedbackEntry {
  // Topics: [event_name, agent_id, client_address]
  // Value: struct with remaining fields
  const agentId = Number(scValToNative(event.topic[1]));
  const clientAddress = String(scValToNative(event.topic[2]));
  const data = scValToNative(event.value) as Record<string, unknown>;

  return {
    agentId,
    clientAddress,
    feedbackIndex: Number(data.feedback_index ?? 0),
    value: BigInt(data.value?.toString() ?? "0"),
    valueDecimals: Number(data.value_decimals ?? 0),
    tag1: String(data.tag1 ?? ""),
    tag2: String(data.tag2 ?? ""),
    endpoint: String(data.endpoint ?? ""),
    feedbackUri: String(data.feedback_uri ?? ""),
    feedbackHash: String(data.feedback_hash ?? ""),
    isRevoked: false,
  };
}

export { NetworkConfig as Config };
