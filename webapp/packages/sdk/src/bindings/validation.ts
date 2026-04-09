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
    contractId: "CA6GIV7QB4B3O5SBZZRL3E3XMFFECGRETSN4JXAYTFKF5HUTD4JY2SJQ",
  }
} as const

export const ValidationError = {
  1: {message:"NotOwnerOrApproved"},
  2: {message:"RequestNotFound"},
  3: {message:"InvalidResponse"},
  4: {message:"RequestAlreadyExists"},
  5: {message:"NotDesignatedValidator"},
  6: {message:"AlreadyResponded"},
  7: {message:"AgentNotFound"},
  8: {message:"CounterOverflow"}
}




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
   * Construct and simulate a request_exists transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * ERC-8004 spec: returns true if a validation request exists. Wraps the
   * internal `has_validation` storage check so cross-contract callers can
   * query existence without a panicking unwrap.
   */
  request_exists: ({request_hash}: {request_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

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
        "AAAAAAAAAAAAAAASdmFsaWRhdGlvbl9yZXF1ZXN0AAAAAAAFAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAEXZhbGlkYXRvcl9hZGRyZXNzAAAAAAAAEwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAAAtyZXF1ZXN0X3VyaQAAAAAQAAAAAAAAAAxyZXF1ZXN0X2hhc2gAAAPuAAAAIAAAAAEAAAPpAAAAAgAAB9AAAAAPVmFsaWRhdGlvbkVycm9yAA==",
        "AAAAAAAAAAAAAAATdmFsaWRhdGlvbl9yZXNwb25zZQAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADHJlcXVlc3RfaGFzaAAAA+4AAAAgAAAAAAAAAAhyZXNwb25zZQAAAAQAAAAAAAAADHJlc3BvbnNlX3VyaQAAABAAAAAAAAAADXJlc3BvbnNlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAADdGFnAAAAABAAAAABAAAD6QAAAAIAAAfQAAAAD1ZhbGlkYXRpb25FcnJvcgA=",
        "AAAAAAAAAAAAAAAVZ2V0X3ZhbGlkYXRpb25fc3RhdHVzAAAAAAAAAQAAAAAAAAAMcmVxdWVzdF9oYXNoAAAD7gAAACAAAAABAAAD6QAAB9AAAAAQVmFsaWRhdGlvblN0YXR1cwAAB9AAAAAPVmFsaWRhdGlvbkVycm9yAA==",
        "AAAAAAAAALdFUkMtODAwNCBzcGVjOiByZXR1cm5zIHRydWUgaWYgYSB2YWxpZGF0aW9uIHJlcXVlc3QgZXhpc3RzLiBXcmFwcyB0aGUKaW50ZXJuYWwgYGhhc192YWxpZGF0aW9uYCBzdG9yYWdlIGNoZWNrIHNvIGNyb3NzLWNvbnRyYWN0IGNhbGxlcnMgY2FuCnF1ZXJ5IGV4aXN0ZW5jZSB3aXRob3V0IGEgcGFuaWNraW5nIHVud3JhcC4AAAAADnJlcXVlc3RfZXhpc3RzAAAAAAABAAAAAAAAAAxyZXF1ZXN0X2hhc2gAAAPuAAAAIAAAAAEAAAAB",
        "AAAAAAAAAAAAAAALZ2V0X3N1bW1hcnkAAAAAAwAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAAAAABN2YWxpZGF0b3JfYWRkcmVzc2VzAAAAA+oAAAATAAAAAAAAAAN0YWcAAAAAEAAAAAEAAAfQAAAAEVZhbGlkYXRpb25TdW1tYXJ5AAAA",
        "AAAAAAAAAAAAAAAfZ2V0X2FnZW50X3ZhbGlkYXRpb25zX3BhZ2luYXRlZAAAAAADAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+oAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAgZ2V0X3ZhbGlkYXRvcl9yZXF1ZXN0c19wYWdpbmF0ZWQAAAADAAAAAAAAABF2YWxpZGF0b3JfYWRkcmVzcwAAAAAAABMAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+oAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAVZ2V0X2lkZW50aXR5X3JlZ2lzdHJ5AAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAKZXh0ZW5kX3R0bAAAAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=",
        "AAAABAAAAAAAAAAAAAAAD1ZhbGlkYXRpb25FcnJvcgAAAAAIAAAAAAAAABJOb3RPd25lck9yQXBwcm92ZWQAAAAAAAEAAAAAAAAAD1JlcXVlc3ROb3RGb3VuZAAAAAACAAAAAAAAAA9JbnZhbGlkUmVzcG9uc2UAAAAAAwAAAAAAAAAUUmVxdWVzdEFscmVhZHlFeGlzdHMAAAAEAAAAAAAAABZOb3REZXNpZ25hdGVkVmFsaWRhdG9yAAAAAAAFAAAAAAAAABBBbHJlYWR5UmVzcG9uZGVkAAAABgAAAAAAAAANQWdlbnROb3RGb3VuZAAAAAAAAAcAAAAAAAAAD0NvdW50ZXJPdmVyZmxvdwAAAAAI",
        "AAAABQAAALtFUkMtODAwNCBzcGVjIGV2ZW50IG5hbWVzIGFyZSBgVmFsaWRhdGlvblJlcXVlc3RgIGFuZCBgVmFsaWRhdGlvblJlc3BvbnNlYAoobm8gcGFzdC10ZW5zZSBzdWZmaXgpLiBUaGUgcHJldmlvdXMgYFZhbGlkYXRpb25SZXF1ZXN0ZWRgIC8KYFZhbGlkYXRpb25SZXNwb25kZWRgIG5hbWVzIGRpZCBub3QgbWF0Y2ggdGhlIHNwZWMuAAAAAAAAAAARVmFsaWRhdGlvblJlcXVlc3QAAAAAAAABAAAAEnZhbGlkYXRpb25fcmVxdWVzdAAAAAAABAAAAAAAAAARdmFsaWRhdG9yX2FkZHJlc3MAAAAAAAATAAAAAQAAAAAAAAAIYWdlbnRfaWQAAAAEAAAAAQAAAD1FUkMtODAwNCBzcGVjIGxpc3RzIGByZXF1ZXN0SGFzaGAgYXMgdGhlIHRoaXJkIGluZGV4ZWQgdG9waWMuAAAAAAAADHJlcXVlc3RfaGFzaAAAA+4AAAAgAAAAAQAAAAAAAAALcmVxdWVzdF91cmkAAAAAEAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAElZhbGlkYXRpb25SZXNwb25zZQAAAAAAAQAAABN2YWxpZGF0aW9uX3Jlc3BvbnNlAAAAAAcAAAAAAAAAEXZhbGlkYXRvcl9hZGRyZXNzAAAAAAAAEwAAAAEAAAAAAAAACGFnZW50X2lkAAAABAAAAAEAAAA9RVJDLTgwMDQgc3BlYyBsaXN0cyBgcmVxdWVzdEhhc2hgIGFzIHRoZSB0aGlyZCBpbmRleGVkIHRvcGljLgAAAAAAAAxyZXF1ZXN0X2hhc2gAAAPuAAAAIAAAAAEAAAAAAAAACHJlc3BvbnNlAAAABAAAAAAAAAAAAAAADHJlc3BvbnNlX3VyaQAAABAAAAAAAAAAAAAAAA1yZXNwb25zZV9oYXNoAAAAAAAD7gAAACAAAAAAAAAAAAAAAAN0YWcAAAAAEAAAAAAAAAAC",
        "AAAAAQAAAAAAAAAAAAAAEFZhbGlkYXRpb25TdGF0dXMAAAAHAAAAAAAAAAhhZ2VudF9pZAAAAAQAAAAAAAAADGhhc19yZXNwb25zZQAAAAEAAAAAAAAAC2xhc3RfdXBkYXRlAAAAAAYAAAAAAAAACHJlc3BvbnNlAAAABAAAAAAAAAANcmVzcG9uc2VfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAN0YWcAAAAAEAAAAAAAAAARdmFsaWRhdG9yX2FkZHJlc3MAAAAAAAAT",
        "AAAAAQAAAAAAAAAAAAAAEVZhbGlkYXRpb25TdW1tYXJ5AAAAAAAAAgAAAAAAAAAQYXZlcmFnZV9yZXNwb25zZQAAAAQAAAAAAAAABWNvdW50AAAAAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    validation_request: this.txFromJSON<Result<void>>,
        validation_response: this.txFromJSON<Result<void>>,
        get_validation_status: this.txFromJSON<Result<ValidationStatus>>,
        request_exists: this.txFromJSON<boolean>,
        get_summary: this.txFromJSON<ValidationSummary>,
        get_agent_validations_paginated: this.txFromJSON<Array<Buffer>>,
        get_validator_requests_paginated: this.txFromJSON<Array<Buffer>>,
        get_identity_registry: this.txFromJSON<string>,
        extend_ttl: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        version: this.txFromJSON<string>
  }
}