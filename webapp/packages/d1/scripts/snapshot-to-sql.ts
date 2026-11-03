/**
 * Turns a Supabase snapshot (one PostgREST JSON file per table plus manifest.json) into SQL
 * that loads it into the D1 schema:
 *
 *   node scripts/snapshot-to-sql.ts <snapshot-dir> > load.sql
 *   wrangler d1 execute stellar8004 --remote --file load.sql
 *
 * It replaces the tables' contents and leaves the copy-fence row in indexer_locks alone;
 * the cutover step removes it. Exact copies are preferred where the snapshot has them
 * (value_text, agent_uri_data_text, services_text), because JSON numbers lose precision.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Row = Record<string, unknown>;
type Column = string | [name: string, read: (row: Row) => unknown];

const jsonText = (text: string, value: string) => (row: Row) =>
	row[text] ?? (row[value] == null ? null : JSON.stringify(row[value]));

// Children are listed after their parents; deletes run in the reverse order.
const TABLES: Array<{ table: string; columns: Column[] }> = [
	{
		table: 'agents',
		columns: [
			'id', 'owner', 'agent_uri',
			['agent_uri_data', jsonText('agent_uri_data_text', 'agent_uri_data')],
			'wallet', 'created_at', 'updated_at', 'created_ledger', 'tx_hash', 'uri_resolve_attempts',
			'resolve_uri_pending', 'last_resolve_attempt_at',
			['supported_trust', (row) => JSON.stringify(row.supported_trust ?? [])],
			['services', (row) => row.services_text ?? JSON.stringify(row.services ?? [])],
			'x402_enabled', 'mpp_enabled', 'uri_updated_ledger', 'transferred_ledger'
		]
	},
	{ table: 'agent_metadata', columns: ['agent_id', 'key', 'value'] },
	{
		table: 'feedback',
		columns: [
			'id', 'agent_id', 'client_address', 'feedback_index',
			['value', (row) => {
				if (typeof row.value_text !== 'string') throw new Error(`feedback ${row.id}: value_text missing`);
				return row.value_text;
			}],
			'value_decimals', 'tag1', 'tag2', 'endpoint', 'feedback_uri', 'feedback_hash', 'is_revoked',
			'created_at', 'created_ledger', 'tx_hash', 'revoked_ledger'
		]
	},
	{
		table: 'feedback_responses',
		columns: [
			'id', 'agent_id', 'client_address', 'feedback_index', 'response_index', 'responder',
			'response_uri', 'response_hash', 'created_at', 'tx_hash', 'event_id'
		]
	},
	{
		table: 'validations',
		columns: [
			'request_hash', 'agent_id', 'validator_address', 'request_uri', 'response', 'response_uri',
			'response_hash', 'tag', 'has_response', 'created_at', 'responded_at', 'request_tx_hash',
			'response_tx_hash', 'response_ledger'
		]
	},
	{ table: 'indexer_dead_letter', columns: ['id', 'contract', 'reason', 'event_id', 'ledger', 'detail', 'created_at'] },
	{
		table: 'indexer_state',
		columns: ['id', 'last_ledger', 'updated_at', 'expected_next_ledger', 'defer_attempts', 'last_advanced_at']
	}
];

function literal(value: unknown, where: string): string {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'boolean') return value ? '1' : '0';
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value)) throw new Error(`${where}: ${value} is not a safe integer`);
		return String(value);
	}
	if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
	throw new Error(`${where}: unexpected ${typeof value}`);
}

export function snapshotToSql(dir: string): string {
	const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
	if (manifest.under_indexer_lock !== true) throw new Error('snapshot was not taken under the indexer lock');

	const lines = [`-- Loaded from the Supabase snapshot taken at ${manifest.taken_at}.`];
	for (const { table } of [...TABLES].reverse()) lines.push(`DELETE FROM ${table};`);
	for (const { table, columns } of TABLES) {
		const file = join(dir, `${table}.json`);
		if (!existsSync(file)) throw new Error(`${table}.json is missing from the snapshot`);
		const names = columns.map((c) => (typeof c === 'string' ? c : c[0]));
		for (const row of JSON.parse(readFileSync(file, 'utf8')) as Row[]) {
			const values = columns.map((c) => {
				const [name, read] = typeof c === 'string' ? [c, (r: Row) => r[c]] : c;
				return literal(read(row), `${table}.${name}`);
			});
			lines.push(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${values.join(', ')});`);
		}
	}
	return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (!process.argv[2]) throw new Error('usage: node scripts/snapshot-to-sql.ts <snapshot-dir>');
	process.stdout.write(snapshotToSql(process.argv[2]));
}
