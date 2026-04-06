import { createSupabaseAdmin, successWithCache, errorResponse, formatAgent, parseIntParam } from '../lib/response.ts';

const AGENTS_SELECT = 'id, owner, wallet, agent_uri, agent_uri_data, supported_trust, x402_enabled, services, created_at';

export async function handleAccounts(address: string, url: URL): Promise<Response> {
  if (!address.startsWith('G') || address.length < 10) {
    return errorResponse('INVALID_ADDRESS', 'Invalid Stellar address', 400);
  }

  const db = createSupabaseAdmin();
  const page = parseIntParam(url.searchParams.get('page'), 1, 1, 10000);
  const limit = parseIntParam(url.searchParams.get('limit'), 20, 1, 100);
  const sortBy = url.searchParams.get('sortBy') ?? 'created_at';
  const sortOrder = url.searchParams.get('sortOrder') ?? 'desc';

  const validSort = ['created_at', 'id'].includes(sortBy) ? sortBy : 'created_at';
  const validOrder = sortOrder === 'asc' ? 'asc' : 'desc';

  const { count } = await db.from('agents').select('*', { count: 'exact', head: true }).eq('owner', address);
  const total = count ?? 0;

  const { data: agents, error } = await db
    .from('agents')
    .select(AGENTS_SELECT)
    .eq('owner', address)
    .order(validSort, { ascending: validOrder === 'asc' })
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    console.error('Query error:', error.message);
    return errorResponse('QUERY_ERROR', 'Database query failed', 500);
  }

  const agentIds = (agents ?? []).map((a) => a.id);
  const scoresMap = new Map<number, Record<string, unknown>>();

  if (agentIds.length > 0) {
    const { data: scores } = await db
      .from('leaderboard_scores')
      .select('*')
      .in('agent_id', agentIds);

    for (const s of scores ?? []) {
      scoresMap.set(s.agent_id, s);
    }
  }

  const items = (agents ?? []).map((a) => formatAgent(a, scoresMap.get(a.id) ?? null));

  return successWithCache(items, 30, 120, { pagination: { page, limit, total, hasMore: page * limit < total } });
}
