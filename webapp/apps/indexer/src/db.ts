import type { Db, DbStatement } from '@stellar8004/d1';
import type { EventPacket } from '../../../packages/indexer/src/events.js';
import { log } from '../../../packages/indexer/src/logger.js';

/** A run that has held the lock this long is presumed dead and can be taken over. */
export const LOCK_STALE_MS = 180_000;

/**
 * RPC and JS times ('...Z') in the layout the schema stores ('...+00:00'), which keeps text
 * order equal to time order.
 */
export function pgTime(time: string | Date): string {
	const iso = typeof time === 'string' ? time : time.toISOString();
	if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(iso)) return `${iso.slice(0, -1)}+00:00`;
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid timestamp: ${iso}`);
	return pgTime(parsed);
}

/**
 * Takes the indexer lock unless another run holds it. A holder older than LOCK_STALE_MS is
 * replaced; the copy-fence row ('9999-12-31...') never is, so no run starts before cutover.
 */
export async function acquireLock(db: Db, owner: string, now = new Date()): Promise<boolean> {
	const row = await db
		.prepare(
			`INSERT INTO indexer_locks (lock_name, acquired_at, owner) VALUES ('indexer', ?1, ?2)
			 ON CONFLICT (lock_name) DO UPDATE SET acquired_at = excluded.acquired_at, owner = excluded.owner
			 WHERE indexer_locks.acquired_at < ?3
			 RETURNING owner`
		)
		.bind(pgTime(now), owner, pgTime(new Date(now.getTime() - LOCK_STALE_MS)))
		.first<{ owner: string }>();
	return row?.owner === owner;
}

/** Owner-fenced: a run whose lock was taken over cannot delete its successor's. */
export async function releaseLock(db: Db, owner: string): Promise<void> {
	await db
		.prepare(`DELETE FROM indexer_locks WHERE lock_name = 'indexer' AND owner = ?`)
		.bind(owner)
		.run();
}

export interface Checkpoint {
	lastLedger: number;
	deferAttempts: number;
}

/** All checkpoints in one read. A missing row is fatal: the indexer never cold-starts. */
export async function readCheckpoints(
	db: Db,
	contracts: readonly string[]
): Promise<Map<string, Checkpoint>> {
	const { results } = await db
		.prepare('SELECT id, last_ledger, defer_attempts FROM indexer_state')
		.all<{ id: string; last_ledger: number; defer_attempts: number }>();
	const checkpoints = new Map(
		results.map((row) => [
			row.id,
			{ lastLedger: row.last_ledger, deferAttempts: row.defer_attempts }
		])
	);
	for (const contract of contracts) {
		if (!checkpoints.has(contract))
			throw new Error(`indexer_state has no row for ${contract}; refusing to cold-start`);
	}
	return checkpoints;
}

/** last_advanced_at moves only when last_ledger does, so health reads real progress. */
export async function saveCheckpoint(
	db: Db,
	contract: string,
	checkpoint: Checkpoint,
	now = new Date()
): Promise<void> {
	await db
		.prepare(
			`UPDATE indexer_state
			 SET last_ledger = ?1, expected_next_ledger = ?1 + 1, defer_attempts = ?2, updated_at = ?3,
			     last_advanced_at = CASE WHEN ?1 > last_ledger THEN ?3 ELSE last_advanced_at END
			 WHERE id = ?4`
		)
		.bind(checkpoint.lastLedger, checkpoint.deferAttempts, pgTime(now), contract)
		.run();
}

export type DeadLetterReason =
	'skip-retryable' | 'skip-nonretryable' | 'retention-clamp' | 'unparseable';

/**
 * Records what the indexer moves past without writing. Best effort: a failure here is logged and
 * never thrown, so it cannot wedge the loop it makes observable. An event is recorded once per
 * reason, because a deferred page is read again on the next run.
 */
export async function deadLetter(
	db: Db,
	entry: {
		contract: string;
		reason: DeadLetterReason;
		eventId?: string;
		ledger?: number;
		detail?: string;
	}
): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO indexer_dead_letter (contract, reason, event_id, ledger, detail)
				 SELECT ?1, ?2, ?3, ?4, ?5
				 WHERE ?3 IS NULL OR NOT EXISTS (SELECT 1 FROM indexer_dead_letter WHERE event_id = ?3 AND reason = ?2)`
			)
			.bind(
				entry.contract,
				entry.reason,
				entry.eventId ?? null,
				entry.ledger ?? null,
				entry.detail ?? null
			)
			.run();
	} catch (error) {
		log({ level: 'warn', msg: 'Failed to record dead letter', ...entry, error: String(error) });
	}
}

/**
 * 'parent' when a referenced row is not indexed yet (worth deferring), 'constraint' for any other
 * constraint failure, null for everything else, which is never the event's fault.
 */
export function constraintFailure(error: unknown): 'parent' | 'constraint' | null {
	const message = error instanceof Error ? error.message : String(error);
	if (message.includes('FOREIGN KEY constraint failed')) return 'parent';
	if (message.includes('constraint failed')) return 'constraint';
	return null;
}

const SQL = {
	registered: `INSERT INTO agents (id, owner, agent_uri, resolve_uri_pending, created_at, created_ledger, tx_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
	uriUpdated: `UPDATE agents
		SET agent_uri = ?1, agent_uri_data = NULL, supported_trust = '[]', services = '[]', uri_resolve_attempts = 0,
		    resolve_uri_pending = 1, uri_updated_ledger = ?2, updated_at = ?3
		WHERE id = ?4 AND (uri_updated_ledger IS NULL OR uri_updated_ledger <= ?2)`,
	metadataSet: `INSERT INTO agent_metadata (agent_id, key, value) VALUES (?, ?, ?)
		ON CONFLICT (agent_id, key) DO UPDATE SET value = excluded.value`,
	walletSet: 'UPDATE agents SET wallet = ?, updated_at = ? WHERE id = ?',
	// The agents_transfer_clears_metadata trigger clears metadata only when this guard matched.
	transferred: `UPDATE agents SET owner = ?1, wallet = NULL, transferred_ledger = ?2, updated_at = ?3
		WHERE id = ?4 AND (transferred_ledger IS NULL OR transferred_ledger <= ?2)`,
	newFeedback: `INSERT INTO feedback (agent_id, client_address, feedback_index, value, value_decimals, tag1, tag2,
		endpoint, feedback_uri, feedback_hash, created_at, created_ledger, tx_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (agent_id, client_address, feedback_index) DO NOTHING`,
	feedbackRevoked: `UPDATE feedback SET is_revoked = 1, revoked_ledger = ?1
		WHERE agent_id = ?2 AND client_address = ?3 AND feedback_index = ?4
		  AND (revoked_ledger IS NULL OR revoked_ledger <= ?1)`,
	// The next response_index in the same statement; event_id makes a replay a no-op.
	responseAppended: `INSERT INTO feedback_responses (agent_id, client_address, feedback_index, response_index,
		responder, response_uri, response_hash, created_at, tx_hash, event_id)
		SELECT ?1, ?2, ?3, COALESCE(MAX(response_index), 0) + 1, ?4, ?5, ?6, ?7, ?8, ?9
		FROM feedback_responses WHERE agent_id = ?1 AND client_address = ?2 AND feedback_index = ?3
		ON CONFLICT (event_id) DO NOTHING`,
	validationRequest: `INSERT INTO validations (request_hash, agent_id, validator_address, request_uri, created_at,
		request_tx_hash) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (request_hash) DO NOTHING`,
	validationResponse: `UPDATE validations
		SET response = ?1, response_uri = ?2, response_hash = ?3, tag = ?4, has_response = 1, responded_at = ?5,
		    response_tx_hash = ?6, response_ledger = ?7
		WHERE request_hash = ?8 AND (response_ledger IS NULL OR response_ledger <= ?7)`
};

/**
 * One statement per event. Immutable events insert or do nothing; mutations are guarded by the
 * ledger they were applied at, so a replayed older event never undoes a newer one. u64 feedback
 * indexes bind as decimal text, which INTEGER affinity stores exactly.
 */
export function eventStatement(db: Db, { data: e }: EventPacket, now: string): DbStatement {
	switch (e.type) {
		case 'Registered':
			return db
				.prepare(SQL.registered)
				.bind(
					e.agentId,
					e.owner,
					e.agentUri,
					e.agentUri.length > 0 ? 1 : 0,
					pgTime(e.ledgerClosedAt),
					e.ledger,
					e.txHash
				);
		case 'UriUpdated':
			return db.prepare(SQL.uriUpdated).bind(e.newUri, e.ledger, now, e.agentId);
		case 'MetadataSet':
			return db.prepare(SQL.metadataSet).bind(e.agentId, e.key, e.value);
		case 'AgentWalletSet':
			return db.prepare(SQL.walletSet).bind(e.newWallet, now, e.agentId);
		case 'AgentWalletUnset':
			return db.prepare(SQL.walletSet).bind(null, now, e.agentId);
		case 'AgentTransferred':
			return db.prepare(SQL.transferred).bind(e.to, e.ledger, now, e.agentId);
		case 'NewFeedback':
			return db
				.prepare(SQL.newFeedback)
				.bind(
					e.agentId,
					e.clientAddress,
					e.feedbackIndex.toString(),
					e.value.toString(),
					e.valueDecimals,
					e.tag1 || null,
					e.tag2 || null,
					e.endpoint || null,
					e.feedbackUri || null,
					e.feedbackHash || null,
					pgTime(e.ledgerClosedAt),
					e.ledger,
					e.txHash
				);
		case 'FeedbackRevoked':
			return db
				.prepare(SQL.feedbackRevoked)
				.bind(e.ledger, e.agentId, e.clientAddress, e.feedbackIndex.toString());
		case 'ResponseAppended':
			return db
				.prepare(SQL.responseAppended)
				.bind(
					e.agentId,
					e.clientAddress,
					e.feedbackIndex.toString(),
					e.responder,
					e.responseUri || null,
					e.responseHash || null,
					pgTime(e.ledgerClosedAt),
					e.txHash,
					e.eventId
				);
		case 'ValidationRequest':
			return db
				.prepare(SQL.validationRequest)
				.bind(
					e.requestHash,
					e.agentId,
					e.validatorAddress,
					e.requestUri || null,
					pgTime(e.ledgerClosedAt),
					e.txHash
				);
		case 'ValidationResponse':
			return db
				.prepare(SQL.validationResponse)
				.bind(
					e.response,
					e.responseUri || null,
					e.responseHash || null,
					e.tag || null,
					pgTime(e.ledgerClosedAt),
					e.txHash,
					e.ledger,
					e.requestHash
				);
	}
}
