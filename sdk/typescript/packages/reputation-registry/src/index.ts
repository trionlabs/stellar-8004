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
    contractId: "CACIFRSDXQ5BQDWN6UNKH65IFA2ALRMLVQWRK33EXZYVYOS32TLUP5UG",
  }
} as const

export const ReputationError = {
  1: {message:"SelfFeedback"},
  2: {message:"FeedbackNotFound"},
  3: {message:"NotFeedbackAuthor"},
  4: {message:"InvalidValueDecimals"},
  5: {message:"NotOwnerOrApproved"},
  6: {message:"AgentNotFound"}
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
   */
  get_summary: ({agent_id, client_addresses, tag1, tag2}: {agent_id: u32, client_addresses: Array<string>, tag1: string, tag2: string}, options?: MethodOptions) => Promise<AssembledTransaction<SummaryResult>>

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
        "AAAAAAAAAAAAAAALZ2V0X3N1bW1hcnkAAAAABAAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAABBjbGllbnRfYWRkcmVzc2VzAAAD6gAAABMAAAAAAAAABHRhZzEAAAAQAAAAAAAAAAR0YWcyAAAAEAAAAAEAAAfQAAAADVN1bW1hcnlSZXN1bHQAAAA=",
        "AAAAAAAAAAAAAAAVZ2V0X2NsaWVudHNfcGFnaW5hdGVkAAAAAAAAAwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAAVzdGFydAAAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAOZ2V0X2xhc3RfaW5kZXgAAAAAAAIAAAAAAAAACGFnZW50X2lkAAAABAAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAABg==",
        "AAAAAAAAAAAAAAASZ2V0X3Jlc3BvbnNlX2NvdW50AAAAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAADmNsaWVudF9hZGRyZXNzAAAAAAATAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAEAAAAE",
        "AAAAAAAAAAAAAAAKZXh0ZW5kX3R0bAAAAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=",
        "AAAABAAAAAAAAAAAAAAAD1JlcHV0YXRpb25FcnJvcgAAAAAGAAAAAAAAAAxTZWxmRmVlZGJhY2sAAAABAAAAAAAAABBGZWVkYmFja05vdEZvdW5kAAAAAgAAAAAAAAARTm90RmVlZGJhY2tBdXRob3IAAAAAAAADAAAAAAAAABRJbnZhbGlkVmFsdWVEZWNpbWFscwAAAAQAAAAAAAAAEk5vdE93bmVyT3JBcHByb3ZlZAAAAAAABQAAAAAAAAANQWdlbnROb3RGb3VuZAAAAAAAAAY=",
        "AAAABQAAAAAAAAAAAAAAC05ld0ZlZWRiYWNrAAAAAAEAAAAMbmV3X2ZlZWRiYWNrAAAACgAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAQAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAAAAAAAA5mZWVkYmFja19pbmRleAAAAAAABgAAAAAAAAAAAAAABXZhbHVlAAAAAAAACwAAAAAAAAAAAAAADnZhbHVlX2RlY2ltYWxzAAAAAAAEAAAAAAAAAAAAAAAEdGFnMQAAABAAAAAAAAAAAAAAAAR0YWcyAAAAEAAAAAAAAAAAAAAACGVuZHBvaW50AAAAEAAAAAAAAAAAAAAADGZlZWRiYWNrX3VyaQAAABAAAAAAAAAAAAAAAA1mZWVkYmFja19oYXNoAAAAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0ZlZWRiYWNrUmV2b2tlZAAAAAABAAAAEGZlZWRiYWNrX3Jldm9rZWQAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAABAAAAAAAAAA5jbGllbnRfYWRkcmVzcwAAAAAAEwAAAAEAAAAAAAAADmZlZWRiYWNrX2luZGV4AAAAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEFJlc3BvbnNlQXBwZW5kZWQAAAABAAAAEXJlc3BvbnNlX2FwcGVuZGVkAAAAAAAABgAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAQAAAAAAAAAOY2xpZW50X2FkZHJlc3MAAAAAABMAAAABAAAAAAAAAAlyZXNwb25kZXIAAAAAAAATAAAAAAAAAAAAAAAOZmVlZGJhY2tfaW5kZXgAAAAAAAYAAAAAAAAAAAAAAAxyZXNwb25zZV91cmkAAAAQAAAAAAAAAAAAAAANcmVzcG9uc2VfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAI=",
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
        get_summary: this.txFromJSON<SummaryResult>,
        get_clients_paginated: this.txFromJSON<Array<string>>,
        get_last_index: this.txFromJSON<u64>,
        get_response_count: this.txFromJSON<u32>,
        extend_ttl: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        version: this.txFromJSON<string>
  }
}