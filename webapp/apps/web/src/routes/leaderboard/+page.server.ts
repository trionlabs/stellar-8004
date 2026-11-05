import { decodeRow, getDb } from '$lib/server/d1.js';
import type { ScoreRow } from '$lib/server/utils.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform }) => {
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const perPage = 50;
	const offset = (page - 1) * perPage;

	const db = getDb(platform);
	const [list, count] = await db.batch([
		db
			.prepare(
				`SELECT agent_id, agent_name, agent_image, owner, supported_trust, has_services,
				        feedback_count, avg_score, unique_clients, total_score
				 FROM leaderboard_scores
				 ORDER BY total_score DESC, agent_id
				 LIMIT ? OFFSET ?`
			)
			.bind(perPage, offset),
		db.prepare('SELECT COUNT(*) AS n FROM leaderboard_scores')
	]);
	const total = Number((count.results[0] as { n: number }).n);

	return {
		leaders: list.results.map(decodeRow<ScoreRow>),
		page,
		total,
		hasMore: offset + list.results.length < total,
		startRank: offset + 1
	};
};
