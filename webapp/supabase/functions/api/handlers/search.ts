import { createSupabaseAdmin, successWithCache, errorResponse, parseIntParam, formatAgent } from '../lib/response.ts';

export async function handleSearch(url: URL): Promise<Response> {
  const q = url.searchParams.get('q');
  if (!q || q.trim().length === 0) {
    return errorResponse('MISSING_PARAM', 'Query parameter "q" is required', 400);
  }

  const db = createSupabaseAdmin();
  const limit = parseIntParam(url.searchParams.get('limit'), 20, 1, 100);
  const trust = url.searchParams.get('trust') ?? '';
  const minScore = url.searchParams.get('minScore');

  const { data: agents, error } = await db
    .rpc('search_agents_advanced', {
      search_query: q.trim(),
      trust_filter: trust ? trust.split(',') : [],
      min_score: minScore ? parseFloat(minScore) : 0,
      result_limit: limit,
      result_offset: 0,
    });

  if (error) {
    console.error('Query error:', error.message);
    return errorResponse('QUERY_ERROR', 'Database query failed', 500);
  }

  // Normalize to camelCase using the same format as other endpoints
  const items = (agents ?? []).map((row: Record<string, unknown>) => ({
    id: row.agent_id,
    name: row.agent_name,
    image: row.agent_image,
    owner: row.owner,
    supportedTrust: row.supported_trust ?? [],
    hasServices: row.has_services ?? false,
    totalScore: row.total_score ?? 0,
    avgScore: row.avg_score ?? 0,
    feedbackCount: row.feedback_count ?? 0,
    uniqueClients: row.unique_clients ?? 0,
    validationCount: row.validation_count ?? 0,
  }));

  return successWithCache(items, 30, 120);
}
