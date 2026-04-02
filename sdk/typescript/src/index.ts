import { Networks } from "@stellar/stellar-sdk";

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  identityRegistryId: string;
  reputationRegistryId: string;
  validationRegistryId: string;
}

export const TESTNET_CONFIG: NetworkConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  identityRegistryId: "CDO5LAZADIBBU2ERJLP5QFU2DEBFETREED3TJ2Y6UYMHIII7TCZHPM5T",
  reputationRegistryId: "CDQS2PI54MHDBHDOVAVV4HHKVQ5L3OZULEK7NVTWNOLALWC5RLF7B4ZF",
  validationRegistryId: "CCY3KGFXQCQZ2KOK6GNN3UFCSC6MCTIXHEI3EGHQQLJLXREJLQ4RYNJQ",
};

export function getAgentIdentifier(
  config: NetworkConfig,
  agentId: number,
): string {
  return `stellar:testnet:${config.identityRegistryId}#${agentId}`;
}

export { NetworkConfig as Config };
