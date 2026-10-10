import { Address, Contract, rpc, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import fixture from './__tests__/fixtures/rpc29-paired-v4.json';
import {
  canonicalEventId,
  eventsFromTransaction,
  type SourceTransaction,
} from './historical-source.js';

const raw = fixture.getTransactions.selectedTransaction;
const pair = fixture.getEvents.response.result.events[0];
const contract = pair.contractId;
const event = xdr.ContractEvent.fromXDR(raw.events.contractEventsXdr[0][0], 'base64');
function transaction(patch: Partial<SourceTransaction> = {}): SourceTransaction {
  return {
    status: rpc.Api.GetTransactionStatus.SUCCESS,
    ledger: raw.ledger,
    applicationOrder: raw.applicationOrder,
    createdAt: raw.createdAt,
    txHash: raw.txHash,
    resultMetaXdr: xdr.TransactionMeta.fromXDR(raw.resultMetaXdr, 'base64'),
    events: { contractEventsXdr: [[event]], transactionEventsXdr: [] },
    ...patch,
  };
}

// Constructed serialized metadata, deliberately containing filtered prefixes.
// Only the captured v4 fixture above is paired network evidence.
function metaV3(events: xdr.ContractEvent[]): xdr.TransactionMeta {
  const meta = new xdr.TransactionMeta(
    3,
    new xdr.TransactionMetaV3({
      ext: new xdr.ExtensionPoint(0),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext: new xdr.SorobanTransactionMetaExt(0),
        events,
        returnValue: xdr.ScVal.scvVoid(),
        diagnosticEvents: [],
      }),
    }),
  );
  return xdr.TransactionMeta.fromXDR(meta.toXDR());
}

function metaV4(operations: xdr.ContractEvent[][]): xdr.TransactionMeta {
  const meta = xdr.TransactionMeta.fromXDR(raw.resultMetaXdr, 'base64');
  const template = meta.v4().operations()[0];
  meta.v4().operations(
    operations.map((events) => {
      const op = xdr.OperationMetaV2.fromXDR(template.toXDR());
      op.events(events);
      return op;
    }),
  );
  return xdr.TransactionMeta.fromXDR(meta.toXDR());
}

const system = xdr.ContractEvent.fromXDR(event.toXDR());
system.type(xdr.ContractEventType.system());
const unrelated = xdr.ContractEvent.fromXDR(event.toXDR());
unrelated.contractId(
  new Address('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4')
    .toScAddress()
    .contractId(),
);

describe('historical RPC normalization', () => {
  it('matches a real RPC29 getEvents/getTransactions pair byte for byte', () => {
    const [actual] = eventsFromTransaction(transaction(), new Set([contract]));
    expect({
      ...actual,
      contractId: actual.contractId?.contractId(),
      topic: actual.topic.map((v) => v.toXDR('base64')),
      value: actual.value.toXDR('base64'),
    }).toEqual(pair);
    expect(actual.contractId).toBeInstanceOf(Contract);
  });
  it('falls back to metadata when the SDK defaulted absent normalized events to []', () => {
    expect(
      eventsFromTransaction(
        transaction({ events: { contractEventsXdr: [], transactionEventsXdr: [] } }),
        new Set([contract]),
      )[0].id,
    ).toBe(pair.id);
  });
  it('uses v3 ContractEvents directly and preserves the full-array event position', () => {
    const events = eventsFromTransaction(
      transaction({ events: undefined, resultMetaXdr: metaV3([system, unrelated, event]) }),
      new Set([contract]),
    );
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('0021986405739663360-0000000002');
  });
  it('preserves empty v4 operations and filtered prefixes in subsequent operations', () => {
    const tx = transaction({
      events: undefined,
      resultMetaXdr: metaV4([[], [system, unrelated, event]]),
    });
    expect(eventsFromTransaction(tx, new Set([contract]))[0]).toMatchObject({
      id: '0021986405739663361-0000000002',
      operationIndex: 1,
      transactionIndex: 1,
    });
  });
  it('uses the same coordinates with normalized operation arrays', () => {
    const tx = transaction({
      events: { transactionEventsXdr: [], contractEventsXdr: [[], [system, event]] },
    });
    expect(eventsFromTransaction(tx, new Set([contract]))[0].id).toBe(
      '0021986405739663361-0000000001',
    );
  });
  it('ignores failed transactions even when metadata contains diagnostic events', () => {
    expect(
      eventsFromTransaction(
        transaction({ status: rpc.Api.GetTransactionStatus.FAILED }),
        new Set([contract]),
      ),
    ).toEqual([]);
  });
  it('rejects unexpected historical transaction status', () => {
    const tx = transaction();
    Reflect.set(tx, 'status', 'NOT_FOUND');
    expect(() => eventsFromTransaction(tx, new Set([contract]))).toThrow(/status/i);
  });
  it('rejects missing metadata and invalid source coordinates instead of certifying emptiness', () => {
    expect(() =>
      eventsFromTransaction(
        transaction({ events: undefined, resultMetaXdr: undefined }),
        new Set([contract]),
      ),
    ).toThrow(/metadata/i);
    expect(() =>
      eventsFromTransaction(transaction({ createdAt: NaN }), new Set([contract])),
    ).toThrow(/timestamp/i);
    for (const coords of [
      [0, 1, 0, 0],
      [1, 0, 0, 0],
      [1, 1, 4096, 0],
      [1, 1, 0, -1],
    ]) {
      expect(() => canonicalEventId(coords[0], coords[1], coords[2], coords[3])).toThrow();
    }
  });
  it('packs large coordinates without floating point loss', () => {
    expect(canonicalEventId(2147483647, 1048575, 4095, 4294967295)).toBe(
      '9223372036854775807-4294967295',
    );
  });
});
