/**
 * Backfill historical Soroban events using RPC getTransactions.
 *
 * The RPC getEvents endpoint has a ~17-hour retention window.
 * The getTransactions endpoint has a much larger window and returns
 * resultMetaXdr which contains contract events. This script scans
 * all transactions from the deploy ledger to current, extracts events
 * for our 3 contracts, and writes them to Supabase.
 *
 * Usage:
 *   SUPABASE_URL=http://... SUPABASE_SERVICE_KEY=... npx tsx scripts/backfill-events.ts
 *
 * On VPS (via docker exec):
 *   docker exec s8004-db psql -U postgres -c "..." to verify results
 */
import * as StellarSdk from '@stellar/stellar-sdk';
import { MAINNET_CONFIG, TESTNET_CONFIG } from '@trionlabs/8004-sdk';

// --- Config ---------------------------------------------------------

// Single source of truth for contract addresses lives in
// `@trionlabs/8004-sdk/src/core/config.ts`. Env vars override per-deployment.
const NETWORK = process.env.STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const SDK_CONFIG = NETWORK === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;

const RPC_URL = process.env.STELLAR_RPC_URL || SDK_CONFIG.rpcUrl;
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const DEPLOY_LEDGER = parseInt(
	process.env.DEPLOY_LEDGER || String(SDK_CONFIG.deployLedger ?? 0),
	10,
);
const BATCH_SIZE = 200; // max transactions per RPC call

const IDENTITY_CONTRACT = process.env.IDENTITY_REGISTRY || SDK_CONFIG.contracts.identity;
const REPUTATION_CONTRACT =
	process.env.REPUTATION_REGISTRY || SDK_CONFIG.contracts.reputation;
const VALIDATION_CONTRACT =
	process.env.VALIDATION_REGISTRY || SDK_CONFIG.contracts.validation;

const CONTRACTS: Record<string, string> = {
	[IDENTITY_CONTRACT]: 'identity',
	[REPUTATION_CONTRACT]: 'reputation',
	[VALIDATION_CONTRACT]: 'validation',
};

const rpcServer = new StellarSdk.rpc.Server(RPC_URL);

// --- Helpers -------------------------------------------------------

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

function toHex(buf: Uint8Array | Buffer): string {
	return Buffer.from(buf).toString('hex');
}

function isValidAddress(addr: string): boolean {
	try {
		return StellarSdk.StrKey.isValidEd25519PublicKey(addr) || StellarSdk.StrKey.isValidContract(addr);
	} catch {
		return false;
	}
}

/**
 * Extract contract events from a transaction's resultMetaXdr.
 * Returns events in a format compatible with our existing parsers.
 */
function extractContractEvents(
	tx: StellarSdk.rpc.Api.TransactionInfo
): Array<{
	contractId: string;
	contractName: string;
	topic: StellarSdk.xdr.ScVal[];
	value: StellarSdk.xdr.ScVal;
	ledger: number;
	ledgerClosedAt: string;
	txHash: string;
}> {
	const events: Array<{
		contractId: string;
		contractName: string;
		topic: StellarSdk.xdr.ScVal[];
		value: StellarSdk.xdr.ScVal;
		ledger: number;
		ledgerClosedAt: string;
		txHash: string;
	}> = [];

	if (tx.status !== 'SUCCESS') return events;
	if (!tx.resultMetaXdr) return events;

	let meta: StellarSdk.xdr.TransactionMeta;
	try {
		meta = typeof tx.resultMetaXdr === 'string'
			? StellarSdk.xdr.TransactionMeta.fromXDR(tx.resultMetaXdr, 'base64')
			: tx.resultMetaXdr;
	} catch {
		return events;
	}

	if (meta.switch() !== 3) return events;

	const v3 = meta.v3();
	const sorobanMeta = v3.sorobanMeta();
	if (!sorobanMeta) return events;

	for (const diagEvent of sorobanMeta.events()) {
		const contractIdBuf = diagEvent.event().contractId();
		if (!contractIdBuf) continue;

		const contractId = StellarSdk.StrKey.encodeContract(contractIdBuf);
		const contractName = CONTRACTS[contractId];
		if (!contractName) continue;

		const body = diagEvent.event().body();
		if (body.switch().name !== 'contractEventBodyV0') continue;

		const v0 = body.v0();
		events.push({
			contractId,
			contractName,
			topic: v0.topics(),
			value: v0.data(),
			ledger: tx.ledger,
			ledgerClosedAt: tx.createdAt,
			txHash: tx.txHash,
		});
	}

	return events;
}

// --- Event Parsers (simplified, matching indexer format) ------------

interface ParsedEvent {
	type: string;
	contractName: string;
	data: Record<string, any>;
}

function parseEventData(raw: any): Record<string, any> {
	if (raw == null) return {};
	if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
	return { value: raw };
}

function parseEvent(event: ReturnType<typeof extractContractEvents>[number]): ParsedEvent | null {
	const { contractName, topic, value, ledger, ledgerClosedAt, txHash } = event;

	if (!topic || topic.length < 1) return null;

	const eventName = StellarSdk.scValToNative(topic[0]) as string;
	const data = parseEventData(StellarSdk.scValToNative(value));

	const base = { ledger, ledgerClosedAt, txHash };

	switch (contractName) {
		case 'identity':
			return parseIdentityEvent(eventName, topic, data, base);
		case 'reputation':
			return parseReputationEvent(eventName, topic, data, base);
		case 'validation':
			return parseValidationEvent(eventName, topic, data, base);
		default:
			return null;
	}
}

function parseIdentityEvent(
	eventName: string,
	topic: StellarSdk.xdr.ScVal[],
	data: Record<string, any>,
	base: { ledger: number; ledgerClosedAt: string; txHash: string }
): ParsedEvent | null {
	switch (eventName) {
		case 'registered': {
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			const owner = String(StellarSdk.scValToNative(topic[2]));
			if (!isValidAddress(owner)) return null;
			return {
				type: 'Registered',
				contractName: 'identity',
				data: { agentId, owner, agentUri: String(data.agent_uri ?? ''), ...base },
			};
		}
		case 'uri_updated': {
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			const updatedBy = String(StellarSdk.scValToNative(topic[2]));
			return {
				type: 'UriUpdated',
				contractName: 'identity',
				data: { agentId, updatedBy, newUri: String(data.new_uri ?? ''), ...base },
			};
		}
		case 'metadata_set': {
			// Spec parity (canonical erc-8004): `key` is an indexed topic at
			// index 2. The reserved `agentWallet` key is promoted to a typed
			// AgentWalletSet/Unset shape so the DB writer routes it to the
			// wallet column instead of the generic metadata table. Empty
			// bytes value -> Unset; otherwise the bytes are the StrKey ASCII
			// of the wallet address.
			if (topic.length < 3) return null;
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			const key = String(StellarSdk.scValToNative(topic[2]));

			if (key === 'agentWallet') {
				const valueBytes: Uint8Array | undefined = data.value;
				const valueText = valueBytes
					? Buffer.from(valueBytes).toString('utf8')
					: '';
				if (valueText.length === 0) {
					return {
						type: 'AgentWalletUnset',
						contractName: 'identity',
						data: { agentId, ...base },
					};
				}
				if (!isValidAddress(valueText)) return null;
				return {
					type: 'AgentWalletSet',
					contractName: 'identity',
					data: { agentId, newWallet: valueText, ...base },
				};
			}

			return {
				type: 'MetadataSet',
				contractName: 'identity',
				data: { agentId, key, value: data.value, ...base },
			};
		}
		// Legacy: pre-spec-alignment WASM emitted dedicated wallet events.
		case 'agent_wallet_set': {
			if (topic.length < 4) return null;
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			const newWallet = String(StellarSdk.scValToNative(topic[2]));
			if (!isValidAddress(newWallet)) return null;
			return {
				type: 'AgentWalletSet',
				contractName: 'identity',
				data: { agentId, newWallet, ...base },
			};
		}
		case 'agent_wallet_unset': {
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			return {
				type: 'AgentWalletUnset',
				contractName: 'identity',
				data: { agentId, ...base },
			};
		}
		default:
			return null;
	}
}

function parseReputationEvent(
	eventName: string,
	topic: StellarSdk.xdr.ScVal[],
	data: Record<string, any>,
	base: { ledger: number; ledgerClosedAt: string; txHash: string }
): ParsedEvent | null {
	switch (eventName) {
		case 'new_feedback': {
			// Spec compliance pass: `tag1` is now an indexed topic at index 3.
			if (topic.length < 4) return null;
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			const clientAddress = String(StellarSdk.scValToNative(topic[2]));
			if (!isValidAddress(clientAddress)) return null;
			const tag1 = String(StellarSdk.scValToNative(topic[3]));
			return {
				type: 'NewFeedback',
				contractName: 'reputation',
				data: {
					agentId,
					clientAddress,
					feedbackIndex: Number(data.feedback_index ?? 0),
					value: data.value,
					valueDecimals: Number(data.value_decimals ?? 0),
					tag1,
					tag2: String(data.tag2 ?? ''),
					endpoint: String(data.endpoint ?? ''),
					feedbackUri: String(data.feedback_uri ?? ''),
					feedbackHash: data.feedback_hash ? toHex(data.feedback_hash) : '',
					...base,
				},
			};
		}
		case 'feedback_revoked': {
			// Spec compliance pass: `feedback_index` is now an indexed topic
			// at index 3. The event body is empty.
			if (topic.length < 4) return null;
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			const clientAddress = String(StellarSdk.scValToNative(topic[2]));
			const feedbackIndex = Number(StellarSdk.scValToNative(topic[3]));
			return {
				type: 'FeedbackRevoked',
				contractName: 'reputation',
				data: { agentId, clientAddress, feedbackIndex, ...base },
			};
		}
		case 'response_appended': {
			// Spec compliance pass: `responder` is now an indexed topic at
			// index 3.
			if (topic.length < 4) return null;
			const agentId = Number(StellarSdk.scValToNative(topic[1]));
			const clientAddress = String(StellarSdk.scValToNative(topic[2]));
			const responder = String(StellarSdk.scValToNative(topic[3]));
			if (!isValidAddress(responder)) return null;
			return {
				type: 'ResponseAppended',
				contractName: 'reputation',
				data: {
					agentId,
					clientAddress,
					responder,
					feedbackIndex: Number(data.feedback_index ?? 0),
					responseUri: String(data.response_uri ?? ''),
					responseHash: data.response_hash ? toHex(data.response_hash) : '',
					...base,
				},
			};
		}
		default:
			return null;
	}
}

function parseValidationEvent(
	eventName: string,
	topic: StellarSdk.xdr.ScVal[],
	data: Record<string, any>,
	base: { ledger: number; ledgerClosedAt: string; txHash: string }
): ParsedEvent | null {
	switch (eventName) {
		case 'validation_request': {
			// Spec compliance pass: renamed from `validation_requested`.
			// `request_hash` is now an indexed topic at index 3.
			if (topic.length < 4) return null;
			const validatorAddress = String(StellarSdk.scValToNative(topic[1]));
			const agentId = Number(StellarSdk.scValToNative(topic[2]));
			if (!isValidAddress(validatorAddress)) return null;
			const requestHash = toHex(StellarSdk.scValToNative(topic[3]));
			return {
				type: 'ValidationRequest',
				contractName: 'validation',
				data: {
					validatorAddress,
					agentId,
					requestHash,
					requestUri: String(data.request_uri ?? ''),
					...base,
				},
			};
		}
		case 'validation_response': {
			// Spec compliance pass: renamed from `validation_responded`.
			// `request_hash` is now an indexed topic at index 3.
			if (topic.length < 4) return null;
			const validatorAddress = String(StellarSdk.scValToNative(topic[1]));
			const agentId = Number(StellarSdk.scValToNative(topic[2]));
			if (!isValidAddress(validatorAddress)) return null;
			const requestHash = toHex(StellarSdk.scValToNative(topic[3]));
			const response = Number(data.response);
			if (!Number.isInteger(response) || response < 0 || response > 100) return null;
			return {
				type: 'ValidationResponse',
				contractName: 'validation',
				data: {
					validatorAddress,
					agentId,
					requestHash,
					response,
					responseUri: String(data.response_uri ?? ''),
					responseHash: data.response_hash ? toHex(data.response_hash) : '',
					tag: String(data.tag ?? ''),
					...base,
				},
			};
		}
		default:
			return null;
	}
}

// --- Database Writers -----------------------------------------------

async function supabasePost(table: string, data: Record<string, any>, upsertOn?: string): Promise<void> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		apikey: SUPABASE_SERVICE_KEY,
		Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
		Prefer: upsertOn ? `resolution=merge-duplicates` : 'return=minimal',
	};
	if (upsertOn) {
		headers['Prefer'] = 'resolution=merge-duplicates';
	}
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(data),
	});
	if (!res.ok && res.status !== 409) {
		const text = await res.text();
		throw new Error(`Supabase ${table} insert failed: ${res.status} ${text}`);
	}
}

async function writeEvent(event: ParsedEvent): Promise<void> {
	const d = event.data;

	switch (event.type) {
		case 'Registered':
			await supabasePost('agents', {
				id: d.agentId,
				owner: d.owner,
				agent_uri: d.agentUri || null,
				created_at: d.ledgerClosedAt,
				created_ledger: d.ledger,
				tx_hash: d.txHash,
				resolve_uri_pending: !!d.agentUri,
			}, 'id');
			break;

		case 'UriUpdated':
			await supabasePost('agents', {
				id: d.agentId,
				agent_uri: d.newUri,
				updated_at: d.ledgerClosedAt,
				resolve_uri_pending: true,
			}, 'id');
			break;

		case 'AgentWalletSet':
			// Synthetic shape derived from a `metadata_set` event whose
			// indexed key is "agentWallet". The on-chain wire event is
			// MetadataSet (per the canonical erc-8004 reference); the
			// parser promotes it to a typed shape for the wallet column.
			await supabasePost('agents', {
				id: d.agentId,
				wallet: d.newWallet,
				updated_at: d.ledgerClosedAt,
			}, 'id');
			break;

		case 'AgentWalletUnset':
			// Same provenance as AgentWalletSet: a `metadata_set` event
			// with the agentWallet key and an empty bytes value. The
			// canonical reference's _update override and unsetAgentWallet
			// emit this on transfer / unset.
			await supabasePost('agents', {
				id: d.agentId,
				wallet: null,
				updated_at: d.ledgerClosedAt,
			}, 'id');
			break;

		case 'NewFeedback':
			await supabasePost('feedback', {
				agent_id: d.agentId,
				client_address: d.clientAddress,
				feedback_index: d.feedbackIndex,
				value: d.value != null ? Number(d.value) : 0,
				value_decimals: d.valueDecimals,
				tag1: d.tag1,
				tag2: d.tag2,
				endpoint: d.endpoint,
				feedback_uri: d.feedbackUri,
				feedback_hash: d.feedbackHash,
				created_at: d.ledgerClosedAt,
				created_ledger: d.ledger,
				tx_hash: d.txHash,
			});
			break;

		case 'FeedbackRevoked':
			// Update existing feedback as revoked
			await fetch(`${SUPABASE_URL}/rest/v1/feedback?agent_id=eq.${d.agentId}&client_address=eq.${d.clientAddress}&feedback_index=eq.${d.feedbackIndex}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					apikey: SUPABASE_SERVICE_KEY,
					Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
				},
				body: JSON.stringify({ is_revoked: true }),
			});
			break;

		case 'ValidationRequest':
			// Spec compliance pass: renamed from ValidationRequested.
			await supabasePost('validations', {
				request_hash: d.requestHash,
				agent_id: d.agentId,
				validator_address: d.validatorAddress,
				request_uri: d.requestUri,
				request_tx_hash: d.txHash,
				created_at: d.ledgerClosedAt,
			}, 'request_hash');
			break;

		case 'ValidationResponse':
			await fetch(`${SUPABASE_URL}/rest/v1/validations?request_hash=eq.${d.requestHash}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					apikey: SUPABASE_SERVICE_KEY,
					Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
				},
				body: JSON.stringify({
					response: d.response,
					response_uri: d.responseUri,
					response_hash: d.responseHash,
					response_tx_hash: d.txHash,
					tag: d.tag,
					has_response: true,
					responded_at: d.ledgerClosedAt,
				}),
			});
			break;

		case 'ResponseAppended':
			// Route through the SECURITY DEFINER function so the advisory
			// lock that derives response_index is held during this insert.
			// A direct INSERT into feedback_responses would bypass the lock
			// added in migration 021 and re-introduce the response_index
			// race that migration was meant to fix.
			await callRpc('insert_feedback_response', {
				p_agent_id: d.agentId,
				p_client_address: d.clientAddress,
				p_feedback_index: String(d.feedbackIndex),
				p_responder: d.responder,
				p_response_uri: d.responseUri,
				p_response_hash: d.responseHash,
				p_created_at: d.ledgerClosedAt,
				p_tx_hash: d.txHash,
			});
			break;
	}
}

// --- Main -----------------------------------------------------------

async function callRpc(name: string, body: unknown = {}): Promise<unknown> {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: SUPABASE_SERVICE_KEY,
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`RPC ${name} failed: ${res.status} ${detail}`);
	}
	return res.json().catch(() => null);
}

async function acquireIndexerLock(): Promise<boolean> {
	const result = await callRpc('acquire_indexer_lock');
	return result === true;
}

async function releaseIndexerLock(): Promise<void> {
	await callRpc('release_indexer_lock').catch((err) => {
		console.error(`Warning: release_indexer_lock failed: ${err}`);
	});
}

async function main() {
	if (!SUPABASE_SERVICE_KEY) {
		console.error('SUPABASE_SERVICE_KEY is required');
		process.exit(1);
	}

	// Take the indexer lock so the live cron-driven indexer cannot run
	// concurrently with this backfill. Without this, both processes upsert
	// the same agents row and the backfill (older event with older
	// agent_uri) silently overwrites the indexer's fresher write.
	const locked = await acquireIndexerLock();
	if (!locked) {
		console.error(
			'Indexer lock is held - another indexer or backfill is running. Aborting.\n' +
				'Wait for it to finish or stop the indexer cron, then re-run.',
		);
		process.exit(1);
	}

	const startTime = Date.now();
	console.log('=== Stellar 8004 Event Backfill ===');
	console.log(`RPC: ${RPC_URL}`);
	console.log(`Supabase: ${SUPABASE_URL}`);
	console.log(`Scanning from deploy ledger ${DEPLOY_LEDGER}...\n`);

	const { sequence: latestLedger } = await rpcServer.getLatestLedger();
	console.log(`Latest ledger: ${latestLedger}`);
	console.log(`Ledger range: ${latestLedger - DEPLOY_LEDGER} ledgers\n`);

	let cursor: string | undefined;
	let startLedger = DEPLOY_LEDGER;
	let totalTxScanned = 0;
	let totalEvents = 0;
	const eventCounts: Record<string, number> = {};
	let errors = 0;

	while (true) {
		let response;
		try {
			const params: any = { pagination: { limit: BATCH_SIZE } };
			if (cursor) {
				params.pagination.cursor = cursor;
			} else {
				params.startLedger = startLedger;
			}

			response = await rpcServer.getTransactions(params);
		} catch (err) {
			console.error(`RPC error: ${err instanceof Error ? err.message : err}`);
			await sleep(3000);
			continue;
		}

		const txs = response.transactions || [];
		if (txs.length === 0) break;

		totalTxScanned += txs.length;
		const lastTx = txs[txs.length - 1];
		const currentLedger = lastTx.ledger;

		for (const tx of txs) {
			const contractEvents = extractContractEvents(tx);
			for (const ce of contractEvents) {
				const parsed = parseEvent(ce);
				if (!parsed) continue;

				try {
					await writeEvent(parsed);
					totalEvents++;
					eventCounts[parsed.type] = (eventCounts[parsed.type] || 0) + 1;
				} catch (err) {
					errors++;
					console.error(`  Write error [${parsed.type}]: ${err instanceof Error ? err.message : err}`);
				}
			}
		}

		// Progress
		const pct = ((currentLedger - DEPLOY_LEDGER) / (latestLedger - DEPLOY_LEDGER) * 100).toFixed(1);
		process.stdout.write(
			`\r  Ledger ${currentLedger} (${pct}%) | ${totalTxScanned} tx scanned | ${totalEvents} events found`
		);

		if (response.cursor) {
			cursor = response.cursor;
		} else {
			break;
		}

		// Small delay to avoid hammering RPC
		await sleep(100);
	}

	console.log('\n');

	// Refresh leaderboard
	console.log('Refreshing leaderboard...');
	await fetch(`${SUPABASE_URL}/rest/v1/rpc/refresh_leaderboard`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: SUPABASE_SERVICE_KEY,
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
		},
		body: '{}',
	});

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log('\n=== Summary ===');
	console.log(`Transactions scanned: ${totalTxScanned}`);
	console.log(`Events found:         ${totalEvents}`);
	console.log(`Errors:               ${errors}`);
	console.log(`Event breakdown:      ${JSON.stringify(eventCounts, null, 2)}`);
	console.log(`Time:                 ${elapsed}s`);
}

main()
	.then(async () => {
		await releaseIndexerLock();
	})
	.catch(async (err) => {
		console.error('FATAL:', err);
		await releaseIndexerLock();
		process.exit(1);
	});
