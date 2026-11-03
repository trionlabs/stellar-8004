import { describe, expect, it } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';

// Mainnet ledger header 65285111 (Protocol 29) re-encoded with the Protocol 30
// STELLAR_VALUE_SIGNED_MS close value from CAP-88. @stellar/stellar-sdk 17.2.1 and
// older throw "LedgerHeader.scpValue.ext.v: unknown enum value 3" on this header, so
// rpc.Server.getLatestLedger() fails once the network runs Protocol 30.
const PROTOCOL_30_LEDGER_HEADER =
	'AAAAHUfkMae3h/C1kxhzyfXbDjAhFtLZ8xWXlSc/wpJQOLRMl2wN2lEZYYSg2HtV4ukzpL0qVlHbmpGGz9QrjCo6ulEAAAAA' +
	'aund6gAAAAAAAAADAAABoaGK2woAAAAAS/g5ZXzPQg6PnPmZ0WOYNwuNDv9SdSW6Rgf8GgvFJx8AAABA22W0Ngsse05Cfd1p' +
	'7GWLyC7zTPW4v8HoB8d7jInlE7xpZc7NdbOPm70zsYF8NA4orRpjfKhdQIauuur1ZLYrA3A+ZVCnEyy1lJ/js3HH8UEuztIf' +
	'EVcV/1ISMZayUA2rkOgRXPHoTCHVL7eYeC9kVUDUZ2vukbbyeGcE268i0AUD5Cv3DqIes+x5W2EAAGPE/lRpywAAARYAAAAA' +
	'byE7ewAAAGQATEtAAAAD6ASSK/XyMJXtptckmLYghtEm+O/rjuezyDt7OMu/tHOUbUGqdKOEMpeknlVgfPewBJpv2KneKX73' +
	'8YYyyXZv7ibh3/ANnO3hcoE1VrFszYN+5q71H7tRnj2QH0tA/VfgejL8KYgcPrA0GZYTQ3+LZiDvoO2DtE3WPnCcNs4EJ92E' +
	'AAAAAA==';

describe('Protocol 30 (Bell) readiness', () => {
	it('decodes a CAP-88 ledger header with a millisecond close time', () => {
		const header = xdr.LedgerHeader.fromXdr(PROTOCOL_30_LEDGER_HEADER, 'base64');
		expect(header.ledgerSeq).toBe(65285111);
		expect(header.scpValue.ext.type).toBe('stellarValueSignedMs');
	});
});
