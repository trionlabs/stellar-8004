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

// Children are listed after their parents; deletes run in the reverse order. `key` lists the
// primary key columns, used to finish a row whose large values are loaded in pieces.
const TABLES: Array<{ table: string; key: string[]; columns: Column[] }> = [
	{
		table: 'agents',
		key: ['id'],
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
	{ table: 'agent_metadata', key: ['agent_id', 'key'], columns: ['agent_id', 'key', 'value'] },
	{
		table: 'feedback',
		key: ['id'],
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
		key: ['id'],
		columns: [
			'id', 'agent_id', 'client_address', 'feedback_index', 'response_index', 'responder',
			'response_uri', 'response_hash', 'created_at', 'tx_hash', 'event_id'
		]
	},
	{
		table: 'validations',
		key: ['request_hash'],
		columns: [
			'request_hash', 'agent_id', 'validator_address', 'request_uri', 'response', 'response_uri',
			'response_hash', 'tag', 'has_response', 'created_at', 'responded_at', 'request_tx_hash',
			'response_tx_hash', 'response_ledger'
		]
	},
	{
		table: 'indexer_dead_letter',
		key: ['id'],
		columns: ['id', 'contract', 'reason', 'event_id', 'ledger', 'detail', 'created_at']
	},
	{
		table: 'indexer_state',
		key: ['id'],
		columns: ['id', 'last_ledger', 'updated_at', 'expected_next_ledger', 'defer_attempts', 'last_advanced_at']
	}
];

// D1 rejects statements longer than 100,000 bytes. Text longer than PIECE_BYTES goes into the
// row as a placeholder and is then written in pieces (each at most 2 * PIECE_BYTES once
// quotes are doubled), joined into the column with one UPDATE so CHECKs see the whole value.
const PIECE_BYTES = 40_000;
const PLACEHOLDERS: Record<string, string> = { 'agents.services': "'[]'", 'agents.supported_trust': "'[]'" };

function pieces(text: string): string[] {
	const out: string[] = [];
	let current = '';
	let bytes = 0;
	for (const char of text) {
		const size = Buffer.byteLength(char);
		if (bytes + size > PIECE_BYTES) {
			out.push(current);
			current = '';
			bytes = 0;
		}
		current += char;
		bytes += size;
	}
	return current ? [...out, current] : out;
}

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

	const lines = [
		`-- Loaded from the Supabase snapshot taken at ${manifest.taken_at}.`,
		// Refuse to run once the cutover deleted the copy fence: loading then would rewind live
		// data. The CHECK fails, and a D1 file import is atomic, so nothing below is applied.
		'CREATE TABLE copy_guard (fence_present INTEGER NOT NULL CHECK (fence_present = 1));',
		"INSERT INTO copy_guard SELECT EXISTS (SELECT 1 FROM indexer_locks WHERE lock_name = 'indexer' AND owner = 'copy-fence');",
		'DROP TABLE copy_guard;',
		'DROP TABLE IF EXISTS load_pieces;',
		'CREATE TABLE load_pieces (k TEXT NOT NULL, i INTEGER NOT NULL, v TEXT NOT NULL, PRIMARY KEY (k, i));'
	];
	for (const { table } of [...TABLES].reverse()) lines.push(`DELETE FROM ${table};`);
	for (const { table, key, columns } of TABLES) {
		const file = join(dir, `${table}.json`);
		if (!existsSync(file)) throw new Error(`${table}.json is missing from the snapshot`);
		const names = columns.map((c) => (typeof c === 'string' ? c : c[0]));
		for (const [index, row] of (JSON.parse(readFileSync(file, 'utf8')) as Row[]).entries()) {
			const finish: string[] = [];
			const values = columns.map((c) => {
				const [name, read] = typeof c === 'string' ? [c, (r: Row) => r[c]] : c;
				const value = read(row);
				if (typeof value !== 'string' || Buffer.byteLength(value) <= PIECE_BYTES) {
					return literal(value, `${table}.${name}`);
				}
				const k = `${table}.${name}.${index}`;
				for (const [i, piece] of pieces(value).entries()) {
					finish.push(`INSERT INTO load_pieces VALUES (${literal(k, k)}, ${i}, ${literal(piece, k)});`);
				}
				const where = key.map((col) => `${col} = ${literal(row[col], `${table}.${col}`)}`).join(' AND ');
				finish.push(
					`UPDATE ${table} SET ${name} = (SELECT group_concat(v, '' ORDER BY i) FROM load_pieces WHERE k = ${literal(k, k)}) WHERE ${where};`
				);
				return PLACEHOLDERS[`${table}.${name}`] ?? 'NULL';
			});
			lines.push(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${values.join(', ')});`, ...finish);
		}
	}
	lines.push('DROP TABLE load_pieces;');
	return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (!process.argv[2]) throw new Error('usage: node scripts/snapshot-to-sql.ts <snapshot-dir>');
	process.stdout.write(snapshotToSql(process.argv[2]));
}
