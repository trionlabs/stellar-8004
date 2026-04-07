import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

type EventResponse = rpc.Api.GetEventsResponse['events'][number];
type ScValTypeHint =
  | 'i128'
  | 'u64'
  | 'u32'
  | 'i64'
  | 'i32'
  | 'u128';

function toScVal(val: unknown, hint?: ScValTypeHint): xdr.ScVal {
  if (val instanceof Address) {
    return val.toScVal();
  }

  if (hint) {
    return nativeToScVal(val as bigint | number, { type: hint });
  }

  return nativeToScVal(val as never);
}

function buildDataScVal(
  data: Record<string, unknown> | undefined,
  typeHints?: Record<string, ScValTypeHint>,
): xdr.ScVal {
  if (data === undefined) {
    return nativeToScVal(undefined);
  }

  const entries = Object.entries(data).map(([key, value]) => {
    const scVal = toScVal(value, typeHints?.[key]);

    return new xdr.ScMapEntry({
      key: nativeToScVal(key, { type: 'symbol' }),
      val: scVal,
    });
  });

  return xdr.ScVal.scvMap(entries);
}

export function mockEvent(opts: {
  topics: unknown[];
  data?: Record<string, unknown>;
  typeHints?: Record<string, ScValTypeHint>;
  ledger?: number;
  txHash?: string;
  contractId?: string;
}): EventResponse {
  const topic = opts.topics.map((value) => toScVal(value));
  const payload = buildDataScVal(opts.data, opts.typeHints);

  return {
    type: 'contract',
    ledger: opts.ledger ?? 1000,
    ledgerClosedAt: '2026-04-03T12:00:00Z',
    contractId: (opts.contractId ??
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M') as unknown as EventResponse['contractId'],
    id: '1000-0-0',
    transactionIndex: 0,
    operationIndex: 0,
    txHash: opts.txHash ?? 'a'.repeat(64),
    topic,
    value: payload,
    inSuccessfulContractCall: true,
  };
}
