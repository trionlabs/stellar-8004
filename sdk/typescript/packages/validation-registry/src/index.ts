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
    contractId: "CCY3KGFXQCQZ2KOK6GNN3UFCSC6MCTIXHEI3EGHQQLJLXREJLQ4RYNJQ",
  }
} as const

export const ValidationError = {
  1: {message:"NotOwnerOrApproved"},
  2: {message:"AgentNotFound"},
  3: {message:"RequestNotFound"},
  4: {message:"InvalidResponse"},
  5: {message:"RequestAlreadyExists"}
}



export type DataKey = {tag: "IdentityRegistry", values: void} | {tag: "Validation", values: readonly [Buffer]} | {tag: "AgentValidationCount", values: readonly [u32]} | {tag: "AgentValidationAt", values: readonly [u32, u32]} | {tag: "ValidatorRequestCount", values: readonly [string]} | {tag: "ValidatorRequestAt", values: readonly [string, u32]};


export interface ValidationStatus {
  agent_id: u32;
  has_response: boolean;
  last_update: u64;
  response: u32;
  response_hash: Buffer;
  tag: string;
  validator_address: string;
}


export interface ValidationSummary {
  average_response: u32;
  count: u64;
}

export interface Client {
  /**
   * Construct and simulate a validation_request transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  validation_request: ({caller, validator_address, agent_id, request_uri, request_hash}: {caller: string, validator_address: string, agent_id: u32, request_uri: string, request_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a validation_response transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  validation_response: ({caller, request_hash, response, response_uri, response_hash, tag}: {caller: string, request_hash: Buffer, response: u32, response_uri: string, response_hash: Buffer, tag: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_validation_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_validation_status: ({request_hash}: {request_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<ValidationStatus>>>

  /**
   * Construct and simulate a get_summary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_summary: ({agent_id, validator_addresses, tag}: {agent_id: u32, validator_addresses: Array<string>, tag: string}, options?: MethodOptions) => Promise<AssembledTransaction<ValidationSummary>>

  /**
   * Construct and simulate a get_agent_validations_paginated transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_agent_validations_paginated: ({agent_id, start, limit}: {agent_id: u32, start: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Buffer>>>

  /**
   * Construct and simulate a get_validator_requests_paginated transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_validator_requests_paginated: ({validator_address, start, limit}: {validator_address: string, start: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Buffer>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {identity_registry}: {identity_registry: string},
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
    return ContractClient.deploy({identity_registry}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAAEWlkZW50aXR5X3JlZ2lzdHJ5AAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAASdmFsaWRhdGlvbl9yZXF1ZXN0AAAAAAAFAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAEXZhbGlkYXRvcl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAAtyZXF1ZXN0X3VyaQAAAAAQAAAAAAAAAAxyZXF1ZXN0X2hhc2gAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAPVmFsaWRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAATdmFsaWRhdGlvbl9yZXNwb25zZQAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADHJlcXVlc3RfaGFzaAAAA+4AAAAgAAAAAAAAAAhyZXNwb25zZQAAAAQAAAAAAAAADHJlc3BvbnNlX3VyaQAAABAAAAAAAAAADXJlc3BvbnNlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAADdGFnAAAAABAAAAABAAAD6QAAAAIAAAfQAAAAD1ZhbGlkYXRpb25FcnJvcgA=",
        "AAAAAAAAAAAAAAAVZ2V0X3ZhbGlkYXRpb25fc3RhdHVzAAAAAAAAAQAAAAAAAAAMcmVxdWVzdF9oYXNoAAAD7gAAACAAAAABAAAD6QAAB9AAAAAQVmFsaWRhdGlvblN0YXR1cwAAB9AAAAAPVmFsaWRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAALZ2V0X3N1bW1hcnkAAAAAAwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAABN2YWxpZGF0b3JfYWRkcmVzc2VzAAAAA+oAAAATAAAAAAAAAAN0YWcAAAAAEAAAAAEAAAfQAAAAEVZhbGlkYXRpb25TdW1tYXJ5AAAA",
        "AAAAAAAAAAAAAAAfZ2V0X2FnZW50X3ZhbGlkYXRpb25zX3BhZ2luYXRlZAAAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+oAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAgZ2V0X3ZhbGlkYXRvcl9yZXF1ZXN0c19wYWdpbmF0ZWQAAAADAAAAAAAAABF2YWxpZGF0b3JfYWRkcmVzcwAAAAAAABMAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+oAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=",
        "AAAABAAAAAAAAAAAAAAAD1ZhbGlkYXRpb25FcnJvcgAAAAAFAAAAAAAAABJOb3RPd25lck9yQXBwcm92ZWQAAAAAAAEAAAAAAAAADUFnZW50Tm90Rm91bmQAAAAAAAACAAAAAAAAAA9SZXF1ZXN0Tm90Rm91bmQAAAAAAwAAAAAAAAAPSW52YWxpZFJlc3BvbnNlAAAAAAQAAAAAAAAAFFJlcXVlc3RBbHJlYWR5RXhpc3RzAAAABQ==",
        "AAAABQAAAAAAAAAAAAAAE1ZhbGlkYXRpb25SZXF1ZXN0ZWQAAAAAAQAAABR2YWxpZGF0aW9uX3JlcXVlc3RlZAAAAAQAAAAAAAAAEXZhbGlkYXRvcl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAAAAAACGFnZW50X2lkAAAABAAAAAEAAAAAAAAADHJlcXVlc3RfaGFzaAAAA+4AAAAgAAAAAAAAAAAAAAALcmVxdWVzdF91cmkAAAAAEAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAE1ZhbGlkYXRpb25SZXNwb25kZWQAAAAAAQAAABR2YWxpZGF0aW9uX3Jlc3BvbmRlZAAAAAcAAAAAAAAAEXZhbGlkYXRvcl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAAAAAACGFnZW50X2lkAAAABAAAAAEAAAAAAAAADHJlcXVlc3RfaGFzaAAAA+4AAAAgAAAAAAAAAAAAAAAIcmVzcG9uc2UAAAAEAAAAAAAAAAAAAAAMcmVzcG9uc2VfdXJpAAAAEAAAAAAAAAAAAAAADXJlc3BvbnNlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAAAAAAA3RhZwAAAAAQAAAAAAAAAAI=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAAEElkZW50aXR5UmVnaXN0cnkAAAABAAAAAAAAAApWYWxpZGF0aW9uAAAAAAABAAAD7gAAACAAAAABAAAAAAAAABRBZ2VudFZhbGlkYXRpb25Db3VudAAAAAEAAAAEAAAAAQAAAAAAAAARQWdlbnRWYWxpZGF0aW9uQXQAAAAAAAACAAAABAAAAAQAAAABAAAAAAAAABVWYWxpZGF0b3JSZXF1ZXN0Q291bnQAAAAAAAABAAAAEwAAAAEAAAAAAAAAElZhbGlkYXRvclJlcXVlc3RBdAAAAAAAAgAAABMAAAAE",
        "AAAAAQAAAAAAAAAAAAAAEFZhbGlkYXRpb25TdGF0dXMAAAAHAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAADGhhc19yZXNwb25zZQAAAAEAAAAAAAAAC2xhc3RfdXBkYXRlAAAAAAYAAAAAAAAACHJlc3BvbnNlAAAABAAAAAAAAAANcmVzcG9uc2VfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAN0YWcAAAAAEAAAAAAAAAARdmFsaWRhdG9yX2FkZHJlc3MAAAAAAAAT",
        "AAAAAQAAAAAAAAAAAAAAEVZhbGlkYXRpb25TdW1tYXJ5AAAAAAAAAgAAAAAAAAAQYXZlcmFnZV9yZXNwb25zZQAAAAQAAAAAAAAABWNvdW50AAAAAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    validation_request: this.txFromJSON<Result<void>>,
        validation_response: this.txFromJSON<Result<void>>,
        get_validation_status: this.txFromJSON<Result<ValidationStatus>>,
        get_summary: this.txFromJSON<ValidationSummary>,
        get_agent_validations_paginated: this.txFromJSON<Array<Buffer>>,
        get_validator_requests_paginated: this.txFromJSON<Array<Buffer>>,
        version: this.txFromJSON<string>
  }
}