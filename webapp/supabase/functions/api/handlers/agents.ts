import { createSupabaseAdmin, successWithCache, errorResponse, paginate, formatAgent, formatAgentDetail, normalizeServices, parseIntParam } from '../lib/response.ts';

const AGENTS_SELECT = 'id, owner, wallet, agent_uri, agent_uri_data, supported_trust, x402_enabled, services, created_at, created_ledger, tx_hash';

export async function handleAgentsList(url: URL): Promise<Response> {
  const db = createSupabaseAdmin();
  const page = parseIntParam(url.searchParams.get('page'), 1, 1, 10000);
  const limit = parseIntParam(url.searchParams.get('limit'), 20, 1, 100);
  const search = url.searchParams.get('search') ?? '';
  const trust = url.searchParams.get('trust') ?? '';
  const minScore = url.searchParams.get('minScore');
  const hasServices = url.searchParams.get('hasServices');
  const x402 = url.searchParams.get('x402');
  const sortBy = url.searchParams.get('sortBy') ?? 'created_at';
  const sortOrder = url.searchParams.get('sortOrder') ?? 'desc';

  // Only columns that exist on agents table can be used for sorting
  const validSort = ['created_at', 'id'].includes(sortBy) ? sortBy : 'created_at';
  const validOrder = sortOrder === 'asc' ? 'asc' : 'desc';

  let query = db.from('agents').select(AGENTS_SELECT, { count: 'exact', head: false });

  if (search) {
    // Use the search_vector GIN index (007_search_index.sql) for full-text search
    query = query.textSearch('search_vector', search, { type: 'plain' });
  }
  if (trust) {
    const trustArr = trust.split(',');
    query = query.overlaps('supported_trust', trustArr);
  }
  if (hasServices === 'true') {
    query = query.neq('services', '[]').neq('services', null);
  }
  if (x402 === 'true') {
    query = query.eq('x402_enabled', true);
  }

  const { count } = await query;
  const total = count ?? 0;

  let dataQuery = db.from('agents').select(AGENTS_SELECT).order(validSort, { ascending: validOrder === 'asc' });

  if (search) {
    dataQuery = dataQuery.textSearch('search_vector', search, { type: 'plain' });
  }
  if (trust) {
    const trustArr = trust.split(',');
    dataQuery = dataQuery.overlaps('supported_trust', trustArr);
  }
  if (hasServices === 'true') {
    dataQuery = dataQuery.neq('services', '[]').neq('services', null);
  }
  if (x402 === 'true') {
    dataQuery = dataQuery.eq('x402_enabled', true);
  }

  const { data: agents, error } = await dataQuery.range((page - 1) * limit, page * limit - 1);

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

  const minScoreNum = minScore ? parseFloat(minScore) : 0;
  const formatted = (agents ?? []).map((a) => {
    const scores = scoresMap.get(a.id) ?? null;
    return formatAgent(a, scores);
  });

  // minScore is applied post-query since total_score lives in leaderboard_scores, not agents.
  // When minScore is active, adjust the total count to reflect the actual filtered result.
  const items = minScoreNum
    ? formatted.filter((a) => ((a as Record<string, unknown>).totalScore as number) >= minScoreNum)
    : formatted;
  const adjustedTotal = minScoreNum ? items.length : total;

  return successWithCache(items, 30, 120, { pagination: paginate(adjustedTotal, page, limit) });
}

export async function handleAgentDetail(id: string): Promise<Response> {
  const agentId = parseInt(id, 10);
  if (isNaN(agentId)) {
    return errorResponse('INVALID_ID', 'Agent ID must be a number', 400);
  }

  const db = createSupabaseAdmin();
  const { data: agent, error } = await db.from('agents').select(AGENTS_SELECT).eq('id', agentId).maybeSingle();

  if (error) {
    console.error('Query error:', error.message);
    return errorResponse('QUERY_ERROR', 'Database query failed', 500);
  }
  if (!agent) {
    return errorResponse('NOT_FOUND', 'Agent not found', 404);
  }

  const [{ data: scores }, { data: metadataRows }] = await Promise.all([
    db.from('leaderboard_scores').select('*').eq('agent_id', agentId).maybeSingle(),
    db.from('agent_metadata').select('key, value').eq('agent_id', agentId),
  ]);

  const detail = formatAgentDetail(agent, scores, metadataRows ?? []);
  return successWithCache(detail, 30, 120);
}

export async function handleAgentFeedback(id: string, url: URL): Promise<Response> {
  const agentId = parseInt(id, 10);
  if (isNaN(agentId)) {
    return errorResponse('INVALID_ID', 'Agent ID must be a number', 400);
  }

  const db = createSupabaseAdmin();
  const page = parseIntParam(url.searchParams.get('page'), 1, 1, 10000);
  const limit = parseIntParam(url.searchParams.get('limit'), 20, 1, 100);
  const tag = url.searchParams.get('tag') ?? '';

  let countQuery = db
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId);

  let dataQuery = db
    .from('feedback')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (tag) {
    countQuery = countQuery.eq('tag1', tag);
    dataQuery = dataQuery.eq('tag1', tag);
  }

  const [{ count }, { data: feedback, error }] = await Promise.all([countQuery, dataQuery]);
  const total = count ?? 0;

  if (error) {
    console.error('Query error:', error.message);
    return errorResponse('QUERY_ERROR', 'Database query failed', 500);
  }

  const feedbackIds = (feedback ?? []).map((f) => ({ agent_id: f.agent_id, client_address: f.client_address, feedback_index: f.feedback_index }));
  const responsesMap = new Map<string, Record<string, unknown>[]>();

  if (feedbackIds.length > 0) {
    const { data: responses } = await db
      .from('feedback_responses')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    for (const r of responses ?? []) {
      const key = `${r.agent_id}:${r.client_address}:${r.feedback_index}`;
      if (!responsesMap.has(key)) responsesMap.set(key, []);
      responsesMap.get(key)!.push({
        responder: r.responder,
        responseUri: r.response_uri,
        createdAt: r.created_at,
      });
    }
  }

  const items = (feedback ?? []).map((f) => ({
    feedbackIndex: f.feedback_index,
    clientAddress: f.client_address,
    value: f.value,
    valueDecimals: f.value_decimals,
    tag1: f.tag1,
    tag2: f.tag2,
    endpoint: f.endpoint,
    feedbackUri: f.feedback_uri,
    isRevoked: f.is_revoked,
    createdAt: f.created_at,
    responses: responsesMap.get(`${f.agent_id}:${f.client_address}:${f.feedback_index}`) ?? [],
  }));

  return successWithCache(items, 60, 300, { pagination: paginate(total, page, limit) });
}
