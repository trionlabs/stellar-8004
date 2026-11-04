import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";



export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55",
  },
  mainnet: {
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    contractId: "CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA",
  }
} as const

export interface FeedbackData {
  is_revoked: boolean;
  tag1: string;
  tag2: string;
  value: i128;
  value_decimals: u32;
}


export interface SummaryResult {
  count: u64;
  summary_value: i128;
  summary_value_decimals: u32;
}

export const ReputationError = {
  1: {message:"SelfFeedback"},
  2: {message:"FeedbackNotFound"},
  3: {message:"InvalidValueDecimals"},
  /**
   * Retained for ABI stability (now unused).
   */
  4: {message:"NotOwnerOrApproved"},
  5: {message:"AggregateOverflow"},
  6: {message:"AgentNotFound"},
  7: {message:"EmptyValue"},
  8: {message:"ValueOutOfRange"},
  9: {message:"ClientAddressesRequired"},
  10: {message:"NoUpgradeProposed"},
  11: {message:"TimelockNotExpired"},
  12: {message:"UpgradeAlreadyProposed"},
  13: {message:"RenounceDisabled"}
}








export interface UpgradeProposal {
  proposed_at: u32;
  wasm_hash: Uint8Array;
}

export const RoleTransferError = {
  2200: {message:"NoPendingTransfer"},
  2201: {message:"InvalidLiveUntilLedger"},
  2202: {message:"InvalidPendingAccount"},
  2203: {message:"TransferExpired"}
}

export const OwnableError = {
  2100: {message:"OwnerNotSet"},
  2101: {message:"TransferInProgress"},
  2102: {message:"OwnerAlreadySet"}
}



export interface Client {
  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `Some(Address)` if ownership is set, or `None` if ownership has
   * been renounced.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   */
  get_owner: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a extend_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  extend_ttl: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_summary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * WAD-normalized average for given clients. Rejects empty client list.
   * Reads at most the `MAX_SUMMARY_FEEDBACK_PER_CLIENT` most recent entries
   * per client. Entries stored before give_feedback checked normalization
   * and that do not fit i128 once normalized are skipped.
   */
  get_summary: ({agent_id, client_addresses, tag1, tag2}: {agent_id: u32, client_addresses: Array<string>, tag1: string, tag2: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<SummaryResult>>>

  /**
   * Construct and simulate a give_feedback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  give_feedback: ({caller, agent_id, value, value_decimals, tag1, tag2, endpoint, feedback_uri, feedback_hash}: {caller: string, agent_id: u32, value: i128, value_decimals: u32, tag1: string, tag2: string, endpoint: string, feedback_uri: string, feedback_hash: Uint8Array}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a read_feedback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  read_feedback: ({agent_id, client_address, feedback_index}: {agent_id: u32, client_address: string, feedback_index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<FeedbackData>>>

  /**
   * Construct and simulate a cancel_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_upgrade: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_last_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_last_index: ({agent_id, client_address}: {agent_id: u32, client_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a append_response transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Callable by anyone.
   */
  append_response: ({caller, agent_id, client_address, feedback_index, response_uri, response_hash}: {caller: string, agent_id: u32, client_address: string, feedback_index: u64, response_uri: string, response_hash: Uint8Array}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a execute_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  execute_upgrade: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pending_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pending_upgrade: (options?: MethodOptions) => Promise<AssembledTransaction<Option<UpgradeProposal>>>

  /**
   * Construct and simulate a propose_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  propose_upgrade: ({new_wasm_hash}: {new_wasm_hash: Uint8Array}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revoke_feedback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke_feedback: ({caller, agent_id, feedback_index}: {caller: string, agent_id: u32, feedback_index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a accept_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts a pending ownership transfer.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * 
   * # Errors
   * 
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * there is no pending transfer to accept.
   * 
   * # Events
   * 
   * * topics - `["ownership_transfer_completed"]`
   * * data - `[new_owner: Address]`
   */
  accept_ownership: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_response_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_response_count: ({agent_id, client_address, feedback_index}: {agent_id: u32, client_address: string, feedback_index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a renounce_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Disabled: without an owner the contract could never be upgraded again.
   * Hand ownership over with `transfer_ownership` and `accept_ownership`.
   */
  renounce_ownership: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initiates a 2-step ownership transfer to a new address.
   * 
   * Requires authorization from the current owner. The new owner must later
   * call `accept_ownership()` to complete the transfer.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * * `new_owner` - The proposed new owner.
   * * `live_until_ledger` - Ledger number until which the new owner can
   * accept. A value of `0` cancels any pending transfer.
   * 
   * # Errors
   * 
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * trying to cancel a transfer that doesn't exist.
   * * [`crate::role_transfer::RoleTransferError::InvalidLiveUntilLedger`] -
   * If the specified ledger is in the past.
   * * [`crate::role_transfer::RoleTransferError::InvalidPendingAccount`] -
   * If the specified pending account is not the same as the provided `new`
   * address.
   * 
   * # Notes
   * 
   * * Authorization for the current owner is required.
   */
  transfer_ownership: ({new_owner, live_until_ledger}: {new_owner: string, live_until_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_clients_paginated transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_clients_paginated: ({agent_id, start, limit}: {agent_id: u32, start: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_identity_registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_identity_registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, identity_registry}: {owner: string, identity_registry: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Uint8Array | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({owner, identity_registry}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAADEZlZWRiYWNrRGF0YQAAAAUAAAAAAAAACmlzX3Jldm9rZWQAAAAAAAEAAAAAAAAABHRhZzEAAAAQAAAAAAAAAAR0YWcyAAAAEAAAAAAAAAAFdmFsdWUAAAAAAAALAAAAAAAAAA52YWx1ZV9kZWNpbWFscwAAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADVN1bW1hcnlSZXN1bHQAAAAAAAADAAAAAAAAAAVjb3VudAAAAAAAAAYAAAAAAAAADXN1bW1hcnlfdmFsdWUAAAAAAAALAAAAAAAAABZzdW1tYXJ5X3ZhbHVlX2RlY2ltYWxzAAAAAAAE",
        "AAAABAAAAAAAAAAAAAAAD1JlcHV0YXRpb25FcnJvcgAAAAANAAAAAAAAAAxTZWxmRmVlZGJhY2sAAAABAAAAAAAAABBGZWVkYmFja05vdEZvdW5kAAAAAgAAAAAAAAAUSW52YWxpZFZhbHVlRGVjaW1hbHMAAAADAAAAKFJldGFpbmVkIGZvciBBQkkgc3RhYmlsaXR5IChub3cgdW51c2VkKS4AAAASTm90T3duZXJPckFwcHJvdmVkAAAAAAAEAAAAAAAAABFBZ2dyZWdhdGVPdmVyZmxvdwAAAAAAAAUAAAAAAAAADUFnZW50Tm90Rm91bmQAAAAAAAAGAAAAAAAAAApFbXB0eVZhbHVlAAAAAAAHAAAAAAAAAA9WYWx1ZU91dE9mUmFuZ2UAAAAACAAAAAAAAAAXQ2xpZW50QWRkcmVzc2VzUmVxdWlyZWQAAAAACQAAAAAAAAARTm9VcGdyYWRlUHJvcG9zZWQAAAAAAAAKAAAAAAAAABJUaW1lbG9ja05vdEV4cGlyZWQAAAAAAAsAAAAAAAAAFlVwZ3JhZGVBbHJlYWR5UHJvcG9zZWQAAAAAAAwAAAAAAAAAEFJlbm91bmNlRGlzYWJsZWQAAAAN",
        "AAAABQAAAAAAAAAAAAAAC05ld0ZlZWRiYWNrAAAAAAEAAAAMbmV3X2ZlZWRiYWNrAAAACgAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAQAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAAAAAAAAR0YWcxAAAAEAAAAAEAAAAAAAAADmZlZWRiYWNrX2luZGV4AAAAAAAGAAAAAAAAAAAAAAAFdmFsdWUAAAAAAAALAAAAAAAAAAAAAAAOdmFsdWVfZGVjaW1hbHMAAAAAAAQAAAAAAAAAAAAAAAR0YWcyAAAAEAAAAAAAAAAAAAAACGVuZHBvaW50AAAAEAAAAAAAAAAAAAAADGZlZWRiYWNrX3VyaQAAABAAAAAAAAAAAAAAAA1mZWVkYmFja19oYXNoAAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0ZlZWRiYWNrUmV2b2tlZAAAAAABAAAAEGZlZWRiYWNrX3Jldm9rZWQAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAABAAAAAAAAAA5jbGllbnRfYWRkcmVzcwAAAAAAEwAAAAEAAAAAAAAADmZlZWRiYWNrX2luZGV4AAAAAAAGAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAD1VwZ3JhZGVFeGVjdXRlZAAAAAABAAAAEHVwZ3JhZGVfZXhlY3V0ZWQAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAC",
        "AAAABQAAAF1FbWl0dGVkIGJ5IGBwcm9wb3NlX3VwZ3JhZGVgLiBgZXhlY3V0ZV91cGdyYWRlYCBzdWNjZWVkcyBmcm9tIGxlZGdlcgpgZXhlY3V0YWJsZV9hdGAgb253YXJkcy4AAAAAAAAAAAAAD1VwZ3JhZGVQcm9wb3NlZAAAAAABAAAAEHVwZ3JhZGVfcHJvcG9zZWQAAAACAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAAAAAADWV4ZWN1dGFibGVfYXQAAAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEFJlc3BvbnNlQXBwZW5kZWQAAAABAAAAEXJlc3BvbnNlX2FwcGVuZGVkAAAAAAAABgAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAQAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAAAAAAAAlyZXNwb25kZXIAAAAAAAATAAAAAQAAAAAAAAAOZmVlZGJhY2tfaW5kZXgAAAAAAAYAAAAAAAAAAAAAAAxyZXNwb25zZV91cmkAAAAQAAAAAAAAAAAAAAANcmVzcG9uc2VfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEFVwZ3JhZGVDYW5jZWxsZWQAAAABAAAAEXVwZ3JhZGVfY2FuY2VsbGVkAAAAAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAAAQAAAAAAAAAAAAAAD1VwZ3JhZGVQcm9wb3NhbAAAAAACAAAAAAAAAAtwcm9wb3NlZF9hdAAAAAAEAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAAAAAAAKZXh0ZW5kX3R0bAAAAAAAAAAAAAA=",
        "AAAAAAAAAQhXQUQtbm9ybWFsaXplZCBhdmVyYWdlIGZvciBnaXZlbiBjbGllbnRzLiBSZWplY3RzIGVtcHR5IGNsaWVudCBsaXN0LgpSZWFkcyBhdCBtb3N0IHRoZSBgTUFYX1NVTU1BUllfRkVFREJBQ0tfUEVSX0NMSUVOVGAgbW9zdCByZWNlbnQgZW50cmllcwpwZXIgY2xpZW50LiBFbnRyaWVzIHN0b3JlZCBiZWZvcmUgZ2l2ZV9mZWVkYmFjayBjaGVja2VkIG5vcm1hbGl6YXRpb24KYW5kIHRoYXQgZG8gbm90IGZpdCBpMTI4IG9uY2Ugbm9ybWFsaXplZCBhcmUgc2tpcHBlZC4AAAALZ2V0X3N1bW1hcnkAAAAABAAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAABBjbGllbnRfYWRkcmVzc2VzAAAD6gAAABMAAAAAAAAABHRhZzEAAAAQAAAAAAAAAAR0YWcyAAAAEAAAAAEAAAPpAAAH0AAAAA1TdW1tYXJ5UmVzdWx0AAAAAAAH0AAAAA9SZXB1dGF0aW9uRXJyb3IA",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAARaWRlbnRpdHlfcmVnaXN0cnkAAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANZ2l2ZV9mZWVkYmFjawAAAAAAAAkAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAAV2YWx1ZQAAAAAAAAsAAAAAAAAADnZhbHVlX2RlY2ltYWxzAAAAAAAEAAAAAAAAAAR0YWcxAAAAEAAAAAAAAAAEdGFnMgAAABAAAAAAAAAACGVuZHBvaW50AAAAEAAAAAAAAAAMZmVlZGJhY2tfdXJpAAAAEAAAAAAAAAANZmVlZGJhY2tfaGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAA9SZXB1dGF0aW9uRXJyb3IA",
        "AAAAAAAAAAAAAAANcmVhZF9mZWVkYmFjawAAAAAAAAMAAAAAAAAACGFnZW50X2lkAAAABAAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAAAAAAADmZlZWRiYWNrX2luZGV4AAAAAAAGAAAAAQAAA+kAAAfQAAAADEZlZWRiYWNrRGF0YQAAB9AAAAAPUmVwdXRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAAOY2FuY2VsX3VwZ3JhZGUAAAAAAAAAAAABAAAD6QAAAAIAAAfQAAAAD1JlcHV0YXRpb25FcnJvcgA=",
        "AAAAAAAAAAAAAAAOZ2V0X2xhc3RfaW5kZXgAAAAAAAIAAAAAAAAACGFnZW50X2lkAAAABAAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAABg==",
        "AAAAAAAAABNDYWxsYWJsZSBieSBhbnlvbmUuAAAAAA9hcHBlbmRfcmVzcG9uc2UAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAADmNsaWVudF9hZGRyZXNzAAAAAAATAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAAAAAAMcmVzcG9uc2VfdXJpAAAAEAAAAAAAAAANcmVzcG9uc2VfaGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAA9SZXB1dGF0aW9uRXJyb3IA",
        "AAAAAAAAAAAAAAAPZXhlY3V0ZV91cGdyYWRlAAAAAAAAAAABAAAD6QAAAAIAAAfQAAAAD1JlcHV0YXRpb25FcnJvcgA=",
        "AAAAAAAAAAAAAAAPcGVuZGluZ191cGdyYWRlAAAAAAAAAAABAAAD6AAAB9AAAAAPVXBncmFkZVByb3Bvc2FsAA==",
        "AAAAAAAAAAAAAAAPcHJvcG9zZV91cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAPUmVwdXRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAAPcmV2b2tlX2ZlZWRiYWNrAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAAPUmVwdXRhdGlvbkVycm9yAA==",
        "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==",
        "AAAAAAAAAAAAAAASZ2V0X3Jlc3BvbnNlX2NvdW50AAAAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAADmNsaWVudF9hZGRyZXNzAAAAAAATAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAEAAAAE",
        "AAAAAAAAAIxEaXNhYmxlZDogd2l0aG91dCBhbiBvd25lciB0aGUgY29udHJhY3QgY291bGQgbmV2ZXIgYmUgdXBncmFkZWQgYWdhaW4uCkhhbmQgb3duZXJzaGlwIG92ZXIgd2l0aCBgdHJhbnNmZXJfb3duZXJzaGlwYCBhbmQgYGFjY2VwdF9vd25lcnNoaXBgLgAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA",
        "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAVZ2V0X2NsaWVudHNfcGFnaW5hdGVkAAAAAAAAAwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAAVzdGFydAAAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAVZ2V0X2lkZW50aXR5X3JlZ2lzdHJ5AAAAAAAAAAAAAAEAAAAT",
        "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==",
        "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=",
        "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    version: this.txFromJSON<string>,
        get_owner: this.txFromJSON<Option<string>>,
        extend_ttl: this.txFromJSON<null>,
        get_summary: this.txFromJSON<Result<SummaryResult>>,
        give_feedback: this.txFromJSON<Result<void>>,
        read_feedback: this.txFromJSON<Result<FeedbackData>>,
        cancel_upgrade: this.txFromJSON<Result<void>>,
        get_last_index: this.txFromJSON<u64>,
        append_response: this.txFromJSON<Result<void>>,
        execute_upgrade: this.txFromJSON<Result<void>>,
        pending_upgrade: this.txFromJSON<Option<UpgradeProposal>>,
        propose_upgrade: this.txFromJSON<Result<void>>,
        revoke_feedback: this.txFromJSON<Result<void>>,
        accept_ownership: this.txFromJSON<null>,
        get_response_count: this.txFromJSON<u32>,
        renounce_ownership: this.txFromJSON<null>,
        transfer_ownership: this.txFromJSON<null>,
        get_clients_paginated: this.txFromJSON<Array<string>>,
        get_identity_registry: this.txFromJSON<string>
  }
}