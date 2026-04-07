import { error } from '@sveltejs/kit';
import { createServerSupabase } from '$lib/supabase-server.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const db = createServerSupabase();
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const perPage = 50;
	const offset = (page - 1) * perPage;

	const { data, error: queryError } = await db
		.from('leaderboard_scores')
		.select('*')
		.order('total_score', { ascending: false })
		.range(offset, offset + perPage - 1);

	if (queryError) {
		throw error(500, queryError.message);
	}

	return {
		leaders: data ?? [],
		page,
		hasMore: (data?.length ?? 0) === perPage,
		startRank: offset + 1
	};
};
