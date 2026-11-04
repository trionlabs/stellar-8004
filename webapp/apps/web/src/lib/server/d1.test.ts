import { describe, expect, it } from 'vitest';
import { createTestD1 } from '@stellar8004/d1/test-db';
import { decodeRow, getDb } from './d1.js';

describe('decodeRow', () => {
	it('parses JSON columns and turns 0/1 flags into booleans, as PostgREST did', async () => {
		const db = createTestD1();
		await db
			.prepare(
				'INSERT INTO agents (id, owner, agent_uri_data, services, x402_enabled) VALUES (1, ?, ?, ?, ?)'
			)
			.bind(
				'GOWNER',
				JSON.stringify({ name: 'Nova' }),
				JSON.stringify([{ name: 'mcp', endpoint: 'https://x' }]),
				true
			)
			.run();
		const row = await db
			.prepare('SELECT * FROM agents WHERE id = 1')
			.first<Record<string, unknown>>();

		expect(decodeRow(row!)).toMatchObject({
			agent_uri_data: { name: 'Nova' },
			services: [{ name: 'mcp', endpoint: 'https://x' }],
			supported_trust: [],
			x402_enabled: true,
			mpp_enabled: false,
			wallet: null
		});
	});

	it('leaves other columns alone, including agent_metadata.value', () => {
		expect(decodeRow({ key: 'k', value: '1', agent_uri_data: null })).toEqual({
			key: 'k',
			value: '1',
			agent_uri_data: null
		});
	});
});

describe('getDb', () => {
	it('fails loudly when the binding is missing', () => {
		expect(() => getDb(undefined)).toThrow('D1 binding DB is missing');
	});
});
