import { Address, Contract, xdr, type rpc } from '@stellar/stellar-sdk';

export type SourceTransaction = Pick<
  rpc.Api.TransactionInfo,
  'status' | 'ledger' | 'applicationOrder' | 'createdAt' | 'txHash'
> &
  Partial<Pick<rpc.Api.TransactionInfo, 'events' | 'resultMetaXdr'>>;

function coordinate(value: number, min: number, max: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

/** RPC v23+ operation-event identity, before type/contract filtering. */
export function canonicalEventId(
  ledger: number,
  transaction: number,
  operation: number,
  event: number,
): string {
  coordinate(ledger, 1, 0x7fffffff, 'ledger');
  coordinate(transaction, 1, 0xfffff, 'transaction index');
  coordinate(operation, 0, 0xfff, 'operation index');
  coordinate(event, 0, 0xffffffff, 'event index');
  const packed = (BigInt(ledger) << 32n) | (BigInt(transaction) << 12n) | BigInt(operation);
  return `${packed.toString().padStart(19, '0')}-${event.toString().padStart(10, '0')}`;
}

/** Validate live IDs against coordinates before using them as ordering keys. */
export function assertEventPosition(event: rpc.Api.EventResponse): void {
  if (
    !/^\d{19}-\d{10}$/.test(event.id) ||
    canonicalEventId(
      event.ledger,
      event.transactionIndex,
      event.operationIndex,
      Number(event.id.slice(20)),
    ) !== event.id
  ) {
    throw new Error(`Invalid canonical event position: ${event.id}`);
  }
}

function operationEvents(tx: SourceTransaction): xdr.ContractEvent[][] {
  const normalized = tx.events?.contractEventsXdr;
  if (normalized?.length) return normalized;
  // SDK defaults an absent normalized field to []. Consult metadata rather
  // than silently treating an older response shape as an eventless transaction.
  const meta = tx.resultMetaXdr;
  if (!meta) throw new Error(`Missing transaction metadata: ${tx.txHash}`);
  switch (meta.type) {
    case 'v1':
    case 'v2':
      return [];
    case 'v3':
      return [meta.v3.sorobanMeta?.events ?? []];
    case 'v4':
      return meta.v4.operations.map((op) => op.events);
    default:
      throw new Error(`Unsupported transaction metadata version: ${meta.type}`);
  }
}

export function eventsFromTransaction(
  tx: SourceTransaction,
  contracts: ReadonlySet<string>,
): rpc.Api.EventResponse[] {
  if (tx.status === 'FAILED') return [];
  if (tx.status !== 'SUCCESS')
    throw new Error(`Unexpected historical transaction status: ${tx.status}`);
  canonicalEventId(tx.ledger, tx.applicationOrder, 0, 0);
  if (!Number.isSafeInteger(tx.createdAt) || tx.createdAt < 0)
    throw new Error('Invalid transaction timestamp');
  const ledgerClosedAt = new Date(tx.createdAt * 1000).toISOString().replace('.000Z', 'Z');
  const result: rpc.Api.EventResponse[] = [];
  for (const [operationIndex, events] of operationEvents(tx).entries()) {
    for (const [eventIndex, event] of events.entries()) {
      const id = canonicalEventId(tx.ledger, tx.applicationOrder, operationIndex, eventIndex);
      const address = event.contractId;
      if (event.type !== xdr.ContractEventType.contract || !address) continue;
      const contractId = Address.fromScAddress(
        xdr.ScAddress.scAddressTypeContract(address),
      ).toString();
      if (!contracts.has(contractId)) continue;
      if (event.body.type !== 'v0') throw new Error(`Unsupported contract event body: ${id}`);
      result.push({
        id,
        type: 'contract',
        contractId: new Contract(contractId),
        ledger: tx.ledger,
        ledgerClosedAt,
        txHash: tx.txHash,
        transactionIndex: tx.applicationOrder,
        operationIndex,
        inSuccessfulContractCall: true,
        topic: event.body.v0.topics,
        value: event.body.v0.data,
      });
    }
  }
  return result;
}
