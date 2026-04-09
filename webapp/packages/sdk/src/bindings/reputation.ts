import { Buffer } from "buffer";
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

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAOSF6L4UPTJSZD6KOJMGOOKUKXZNYRNPA2QBPZPTLGGK6XLGCW72YM4",
  }
} as const

export const ReputationError = {
  /**
   * ERC-8004 spec: `giveFeedback` MUST reject the agent owner and any
   * approved operator. Surfaces a distinguishable code so callers can
   * special-case the self-feedback path in their UI.
   */
  1: {message:"SelfFeedback"},
  2: {message:"FeedbackNotFound"},
  3: {message:"InvalidValueDecimals"},
  4: {message:"NotOwnerOrApproved"},
  5: {message:"AggregateOverflow"},
  6: {message:"AgentNotFound"},
  /**
   * ERC-8004 reference: empty response URIs are rejected.
   */
  7: {message:"EmptyValue"},
  /**
   * ERC-8004 spec: `value` must be in `[-1e38, 1e38]`. Bounds the
   * summary normalization arithmetic against single-feedback overflow.
   */
  8: {message:"ValueOutOfRange"},
  /**
   * ERC-8004 spec: `getSummary` MUST be called with a non-empty client
   * list - all-clients aggregates are a Sybil/spam vector by design.
   * Off-chain consumers compute agent-wide scores via the explorer DB.
   */
  9: {message:"ClientAddressesRequired"}
}




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

export interface Client {
  /**
   * Construct and simulate a give_feedback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  give_feedback: ({caller, agent_id, value, value_decimals, tag1, tag2, endpoint, feedback_uri, feedback_hash}: {caller: string, agent_id: u32, value: i128, value_decimals: u32, tag1: string, tag2: string, endpoint: string, feedback_uri: string, feedback_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revoke_feedback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  revoke_feedback: ({caller, agent_id, feedback_index}: {caller: string, agent_id: u32, feedback_index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a append_response transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  append_response: ({caller, agent_id, client_address, feedback_index, response_uri, response_hash}: {caller: string, agent_id: u32, client_address: string, feedback_index: u64, response_uri: string, response_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a read_feedback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  read_feedback: ({agent_id, client_address, feedback_index}: {agent_id: u32, client_address: string, feedback_index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<FeedbackData>>>

  /**
   * Construct and simulate a get_summary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Spec parity: returns the average over all matching feedback for the
   * given clients, normalized to 18-decimal WAD precision and then scaled
   * back to the most-frequent (mode) `valueDecimals`. Reverts when
   * `client_addresses` is empty - the canonical reference rejects this
   * path explicitly because all-clients aggregates are a Sybil/spam
   * vector. The off-chain explorer is responsible for any "agent-wide"
   * score, where it can apply per-client weighting.
   */
  get_summary: ({agent_id, client_addresses, tag1, tag2}: {agent_id: u32, client_addresses: Array<string>, tag1: string, tag2: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<SummaryResult>>>

  /**
   * Construct and simulate a get_clients_paginated transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_clients_paginated: ({agent_id, start, limit}: {agent_id: u32, start: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_last_index transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_last_index: ({agent_id, client_address}: {agent_id: u32, client_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_response_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_response_count: ({agent_id, client_address, feedback_index}: {agent_id: u32, client_address: string, feedback_index: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_identity_registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_identity_registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a extend_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  extend_ttl: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, identity_registry}: {owner: string, identity_registry: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({owner, identity_registry}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAARaWRlbnRpdHlfcmVnaXN0cnkAAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANZ2l2ZV9mZWVkYmFjawAAAAAAAAkAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAAV2YWx1ZQAAAAAAAAsAAAAAAAAADnZhbHVlX2RlY2ltYWxzAAAAAAAEAAAAAAAAAAR0YWcxAAAAEAAAAAAAAAAEdGFnMgAAABAAAAAAAAAACGVuZHBvaW50AAAAEAAAAAAAAAAMZmVlZGJhY2tfdXJpAAAAEAAAAAAAAAANZmVlZGJhY2tfaGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAACAAAH0AAAAA9SZXB1dGF0aW9uRXJyb3IA",
        "AAAAAAAAAAAAAAAPcmV2b2tlX2ZlZWRiYWNrAAAAAAMAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAAPUmVwdXRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAAPYXBwZW5kX3Jlc3BvbnNlAAAAAAYAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAA5jbGllbnRfYWRkcmVzcwAAAAAAEwAAAAAAAAAOZmVlZGJhY2tfaW5kZXgAAAAAAAYAAAAAAAAADHJlc3BvbnNlX3VyaQAAABAAAAAAAAAADXJlc3BvbnNlX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAPUmVwdXRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAANcmVhZF9mZWVkYmFjawAAAAAAAAMAAAAAAAAACGFnZW50X2lkAAAABAAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAAAAAAADmZlZWRiYWNrX2luZGV4AAAAAAAGAAAAAQAAA+kAAAfQAAAADEZlZWRiYWNrRGF0YQAAB9AAAAAPUmVwdXRhdGlvbkVycm9yAA==",
        "AAAAAAAAAb5TcGVjIHBhcml0eTogcmV0dXJucyB0aGUgYXZlcmFnZSBvdmVyIGFsbCBtYXRjaGluZyBmZWVkYmFjayBmb3IgdGhlCmdpdmVuIGNsaWVudHMsIG5vcm1hbGl6ZWQgdG8gMTgtZGVjaW1hbCBXQUQgcHJlY2lzaW9uIGFuZCB0aGVuIHNjYWxlZApiYWNrIHRvIHRoZSBtb3N0LWZyZXF1ZW50IChtb2RlKSBgdmFsdWVEZWNpbWFsc2AuIFJldmVydHMgd2hlbgpgY2xpZW50X2FkZHJlc3Nlc2AgaXMgZW1wdHkgLSB0aGUgY2Fub25pY2FsIHJlZmVyZW5jZSByZWplY3RzIHRoaXMKcGF0aCBleHBsaWNpdGx5IGJlY2F1c2UgYWxsLWNsaWVudHMgYWdncmVnYXRlcyBhcmUgYSBTeWJpbC9zcGFtCnZlY3Rvci4gVGhlIG9mZi1jaGFpbiBleHBsb3JlciBpcyByZXNwb25zaWJsZSBmb3IgYW55ICJhZ2VudC13aWRlIgpzY29yZSwgd2hlcmUgaXQgY2FuIGFwcGx5IHBlci1jbGllbnQgd2VpZ2h0aW5nLgAAAAAAC2dldF9zdW1tYXJ5AAAAAAQAAAAAAAAACGFnZW50X2lkAAAABAAAAAAAAAAQY2xpZW50X2FkZHJlc3NlcwAAA+oAAAATAAAAAAAAAAR0YWcxAAAAEAAAAAAAAAAEdGFnMgAAABAAAAABAAAD6QAAB9AAAAANU3VtbWFyeVJlc3VsdAAAAAAAB9AAAAAPUmVwdXRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAAVZ2V0X2NsaWVudHNfcGFnaW5hdGVkAAAAAAAAAwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAAVzdGFydAAAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAOZ2V0X2xhc3RfaW5kZXgAAAAAAAIAAAAAAAAACGFnZW50X2lkAAAABAAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAABg==",
        "AAAAAAAAAAAAAAASZ2V0X3Jlc3BvbnNlX2NvdW50AAAAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAADmNsaWVudF9hZGRyZXNzAAAAAAATAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAEAAAAE",
        "AAAAAAAAAAAAAAAVZ2V0X2lkZW50aXR5X3JlZ2lzdHJ5AAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAKZXh0ZW5kX3R0bAAAAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=",
        "AAAABAAAAAAAAAAAAAAAD1JlcHV0YXRpb25FcnJvcgAAAAAJAAAAtEVSQy04MDA0IHNwZWM6IGBnaXZlRmVlZGJhY2tgIE1VU1QgcmVqZWN0IHRoZSBhZ2VudCBvd25lciBhbmQgYW55CmFwcHJvdmVkIG9wZXJhdG9yLiBTdXJmYWNlcyBhIGRpc3Rpbmd1aXNoYWJsZSBjb2RlIHNvIGNhbGxlcnMgY2FuCnNwZWNpYWwtY2FzZSB0aGUgc2VsZi1mZWVkYmFjayBwYXRoIGluIHRoZWlyIFVJLgAAAAxTZWxmRmVlZGJhY2sAAAABAAAAAAAAABBGZWVkYmFja05vdEZvdW5kAAAAAgAAAAAAAAAUSW52YWxpZFZhbHVlRGVjaW1hbHMAAAADAAAAAAAAABJOb3RPd25lck9yQXBwcm92ZWQAAAAAAAQAAAAAAAAAEUFnZ3JlZ2F0ZU92ZXJmbG93AAAAAAAABQAAAAAAAAANQWdlbnROb3RGb3VuZAAAAAAAAAYAAAA1RVJDLTgwMDQgcmVmZXJlbmNlOiBlbXB0eSByZXNwb25zZSBVUklzIGFyZSByZWplY3RlZC4AAAAAAAAKRW1wdHlWYWx1ZQAAAAAABwAAAIBFUkMtODAwNCBzcGVjOiBgdmFsdWVgIG11c3QgYmUgaW4gYFstMWUzOCwgMWUzOF1gLiBCb3VuZHMgdGhlCnN1bW1hcnkgbm9ybWFsaXphdGlvbiBhcml0aG1ldGljIGFnYWluc3Qgc2luZ2xlLWZlZWRiYWNrIG92ZXJmbG93LgAAAA9WYWx1ZU91dE9mUmFuZ2UAAAAACAAAAMZFUkMtODAwNCBzcGVjOiBgZ2V0U3VtbWFyeWAgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIG5vbi1lbXB0eSBjbGllbnQKbGlzdCAtIGFsbC1jbGllbnRzIGFnZ3JlZ2F0ZXMgYXJlIGEgU3liaWwvc3BhbSB2ZWN0b3IgYnkgZGVzaWduLgpPZmYtY2hhaW4gY29uc3VtZXJzIGNvbXB1dGUgYWdlbnQtd2lkZSBzY29yZXMgdmlhIHRoZSBleHBsb3JlciBEQi4AAAAAABdDbGllbnRBZGRyZXNzZXNSZXF1aXJlZAAAAAAJ",
        "AAAABQAAAAAAAAAAAAAAC05ld0ZlZWRiYWNrAAAAAAEAAAAMbmV3X2ZlZWRiYWNrAAAACgAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAQAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAAaUVSQy04MDA0IHNwZWMgbGlzdHMgYHRhZzFgIGFzIHRoZSB0aGlyZCBpbmRleGVkIHRvcGljIHNvIHN1YnNjcmliZXJzCmNhbiBmaWx0ZXIgZmVlZGJhY2sgYnkgdGFnIG9uLWNoYWluLgAAAAAAAAR0YWcxAAAAEAAAAAEAAAAAAAAADmZlZWRiYWNrX2luZGV4AAAAAAAGAAAAAAAAAAAAAAAFdmFsdWUAAAAAAAALAAAAAAAAAAAAAAAOdmFsdWVfZGVjaW1hbHMAAAAAAAQAAAAAAAAAAAAAAAR0YWcyAAAAEAAAAAAAAAAAAAAACGVuZHBvaW50AAAAEAAAAAAAAAAAAAAADGZlZWRiYWNrX3VyaQAAABAAAAAAAAAAAAAAAA1mZWVkYmFja19oYXNoAAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0ZlZWRiYWNrUmV2b2tlZAAAAAABAAAAEGZlZWRiYWNrX3Jldm9rZWQAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAABAAAAAAAAAA5jbGllbnRfYWRkcmVzcwAAAAAAEwAAAAEAAAA/RVJDLTgwMDQgc3BlYyBsaXN0cyBgZmVlZGJhY2tJbmRleGAgYXMgdGhlIHRoaXJkIGluZGV4ZWQgdG9waWMuAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAAEFJlc3BvbnNlQXBwZW5kZWQAAAABAAAAEXJlc3BvbnNlX2FwcGVuZGVkAAAAAAAABgAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAQAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAAfUVSQy04MDA0IHNwZWMgbGlzdHMgYHJlc3BvbmRlcmAgYXMgdGhlIHRoaXJkIGluZGV4ZWQgdG9waWMgc28gdGhlCm9mZi1jaGFpbiBsYXllciBjYW4gZmlsdGVyIHJlc3BvbnNlcyBieSByZXNwb25kZXIgaWRlbnRpdHkuAAAAAAAACXJlc3BvbmRlcgAAAAAAABMAAAABAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAAAAAAAAAAADHJlc3BvbnNlX3VyaQAAABAAAAAAAAAAAAAAAA1yZXNwb25zZV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAAAQAAAAAAAAAAAAAADEZlZWRiYWNrRGF0YQAAAAUAAAAAAAAACmlzX3Jldm9rZWQAAAAAAAEAAAAAAAAABHRhZzEAAAAQAAAAAAAAAAR0YWcyAAAAEAAAAAAAAAAFdmFsdWUAAAAAAAALAAAAAAAAAA52YWx1ZV9kZWNpbWFscwAAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADVN1bW1hcnlSZXN1bHQAAAAAAAADAAAAAAAAAAVjb3VudAAAAAAAAAYAAAAAAAAADXN1bW1hcnlfdmFsdWUAAAAAAAALAAAAAAAAABZzdW1tYXJ5X3ZhbHVlX2RlY2ltYWxzAAAAAAAE" ]),
      options
    )
  }
  public readonly fromJSON = {
    give_feedback: this.txFromJSON<Result<void>>,
        revoke_feedback: this.txFromJSON<Result<void>>,
        append_response: this.txFromJSON<Result<void>>,
        read_feedback: this.txFromJSON<Result<FeedbackData>>,
        get_summary: this.txFromJSON<Result<SummaryResult>>,
        get_clients_paginated: this.txFromJSON<Array<string>>,
        get_last_index: this.txFromJSON<u64>,
        get_response_count: this.txFromJSON<u32>,
        get_identity_registry: this.txFromJSON<string>,
        extend_ttl: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        version: this.txFromJSON<string>
  }
}
