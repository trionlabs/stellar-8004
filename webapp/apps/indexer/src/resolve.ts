import type { Db } from '@stellar8004/d1';
import { log } from '../../../packages/indexer/src/logger.js';
import { pgTime } from './db.js';
import {
	extractMpp,
	extractServices,
	extractSupportedTrust,
	extractX402,
	resolveUri
} from './uri.js';

const RESOLVE_LIMIT = 20;
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 5;
// D1 caps a row at 2,000,000 bytes, and the document is stored next to copies of its services
// and supportedTrust. Bigger documents count as a failed try instead of a failing write.
const MAX_STORED_BYTES = 1_500_000;

interface PendingAgent {
	id: number;
	agent_uri: string;
	uri_resolve_attempts: number;
}

export interface ResolveResult {
	checked: number;
	resolved: number;
	failed: number;
	exhausted: number;
}

/**
 * Port of the resolve-uris edge function. Fetches the documents of up to RESOLVE_LIMIT agents
 * whose URI is pending, CONCURRENCY at a time, waiting 2^attempts minutes after a failed try and
 * giving up after MAX_ATTEMPTS. Each try is recorded before the fetch, so an agent whose document
 * cannot be stored still backs off instead of blocking the queue, and one agent's failure never
 * stops the others. Every write is guarded by the URI it resolved, so a result for a URI that
 * changed meanwhile is dropped.
 */
export async function resolvePending(
	db: Db,
	deadlineMs: number,
	resolve: (uri: string) => Promise<unknown> = resolveUri,
	now: () => Date = () => new Date()
): Promise<ResolveResult> {
	const { results: agents } = await db
		.prepare(
			`SELECT id, agent_uri, uri_resolve_attempts FROM agents
			 WHERE resolve_uri_pending = 1 AND agent_uri_data IS NULL AND agent_uri IS NOT NULL AND agent_uri <> ''
			   AND uri_resolve_attempts < ?1
			   AND (uri_resolve_attempts = 0 OR last_resolve_attempt_at IS NULL
			        OR julianday(?2) - julianday(last_resolve_attempt_at) >= (1 << uri_resolve_attempts) / 1440.0)
			 ORDER BY last_resolve_attempt_at, created_at
			 LIMIT ?3`
		)
		.bind(MAX_ATTEMPTS, pgTime(now()), RESOLVE_LIMIT)
		.all<PendingAgent>();

	const result: ResolveResult = { checked: 0, resolved: 0, failed: 0, exhausted: 0 };
	for (let offset = 0; offset < agents.length && Date.now() < deadlineMs; offset += CONCURRENCY) {
		const round = agents.slice(offset, offset + CONCURRENCY);
		const triedAt = pgTime(now());
		await db.batch(
			round.map((agent) => {
				const attempts = agent.uri_resolve_attempts + 1;
				return db
					.prepare(
						`UPDATE agents SET uri_resolve_attempts = ?1, resolve_uri_pending = ?2, last_resolve_attempt_at = ?3,
						   updated_at = ?3
						 WHERE id = ?4 AND agent_uri = ?5`
					)
					.bind(attempts, attempts < MAX_ATTEMPTS ? 1 : 0, triedAt, agent.id, agent.agent_uri);
			})
		);
		const documents = await Promise.all(
			round.map((agent) => resolve(agent.agent_uri).catch(() => null))
		);
		for (const [index, agent] of round.entries()) {
			result.checked++;
			if (await store(db, agent, documents[index], pgTime(now()))) {
				result.resolved++;
			} else {
				result.failed++;
				if (agent.uri_resolve_attempts + 1 >= MAX_ATTEMPTS) result.exhausted++;
			}
		}
	}
	return result;
}

/**
 * Stores a fetched document and clears the try count. False, leaving the try recorded, when
 * nothing was stored, including when the agent's URI changed while the document was fetched.
 */
async function store(
	db: Db,
	agent: PendingAgent,
	document: unknown,
	now: string
): Promise<boolean> {
	if (document == null) return false;
	try {
		const data = JSON.stringify(document);
		const trust = JSON.stringify(extractSupportedTrust(document));
		const services = JSON.stringify(extractServices(document));
		const bytes = new TextEncoder().encode(data + trust + services).byteLength;
		if (bytes > MAX_STORED_BYTES) {
			log({ level: 'warn', msg: 'Resolved document too big to store', agentId: agent.id, bytes });
			return false;
		}
		const { meta } = await db
			.prepare(
				`UPDATE agents
				 SET agent_uri_data = ?1, supported_trust = ?2, services = ?3, x402_enabled = ?4, mpp_enabled = ?5,
				     uri_resolve_attempts = 0, resolve_uri_pending = 0, updated_at = ?6
				 WHERE id = ?7 AND agent_uri = ?8`
			)
			.bind(
				data,
				trust,
				services,
				extractX402(document) ? 1 : 0,
				extractMpp(document) ? 1 : 0,
				now,
				agent.id,
				agent.agent_uri
			)
			.run();
		return (meta.changes ?? 0) > 0;
	} catch (error) {
		// Say, JSON nested deeper than SQLite accepts. The try is already recorded.
		log({
			level: 'warn',
			msg: 'Failed to store resolved document',
			agentId: agent.id,
			error: String(error)
		});
		return false;
	}
}
