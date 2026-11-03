import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('$lib/supabase-server.js', () => ({
	createServerSupabase: () => ({ rpc })
}));

const { load } = await import('./+page.server.js');

const run = (query: string) =>
	load({ url: new URL(`https://stellar8004.com/agents?${query}`) } as Parameters<typeof load>[0]);

describe('agents page search', () => {
	beforeEach(() => {
		rpc.mockReset().mockResolvedValue({ data: [], error: null });
	});

	// The database has 3- and 4-argument search_agents overloads. If owner_filter is left
	// out, PostgREST can't pick one, and the page silently shows every agent instead.
	it('always sends owner_filter so the database can pick one search function', async () => {
		await run('q=logo');
		expect(rpc).toHaveBeenCalledWith('search_agents', expect.objectContaining({ owner_filter: null }));
	});

	it('sends owner_filter with the advanced filters too', async () => {
		await run('q=logo&services=true');
		expect(rpc).toHaveBeenCalledWith(
			'search_agents_advanced',
			expect.objectContaining({ owner_filter: null })
		);
	});
});
