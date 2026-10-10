import { rpc, xdr } from '@stellar/stellar-sdk';
import fixture from './fixtures/rpc29-paired-v4.json';

/** Constructed source transactions, not additional captured network evidence. */
export function transactionWithEvents(events: rpc.Api.EventResponse[]): rpc.Api.TransactionInfo {
  const raw = fixture.getTransactions.selectedTransaction;
  const first = events[0];
  return {
    status: rpc.Api.GetTransactionStatus.SUCCESS,
    txHash: first.txHash,
    ledger: first.ledger,
    applicationOrder: first.transactionIndex,
    createdAt: Date.parse(first.ledgerClosedAt) / 1000,
    feeBump: false,
    envelopeXdr: xdr.TransactionEnvelope.fromXDR(raw.envelopeXdr, 'base64'),
    resultXdr: xdr.TransactionResult.fromXDR(raw.resultXdr, 'base64'),
    resultMetaXdr: xdr.TransactionMeta.fromXDR(raw.resultMetaXdr, 'base64'),
    events: {
      transactionEventsXdr: [],
      contractEventsXdr: [
        events.map(
          (e) =>
            new xdr.ContractEvent({
              ext: new xdr.ExtensionPoint(0),
              contractId: e.contractId!.address().toScAddress().contractId(),
              type: xdr.ContractEventType.contract(),
              body: new xdr.ContractEventBody(
                0,
                new xdr.ContractEventV0({ topics: e.topic, data: e.value }),
              ),
            }),
        ),
      ],
    },
  };
}
