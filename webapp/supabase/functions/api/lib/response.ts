import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export function success(data: unknown, meta: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    success: true,
    data,
    meta: {
      version: '1.0.0',
      chain: 'stellar',
      network: Deno.env.get('STELLAR_NETWORK') ?? 'testnet',
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      ...meta,
    },
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
    },
  });
}

export function successWithCache(data: unknown, maxAge: number, swr: number, meta: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    success: true,
    data,
    meta: {
      version: '1.0.0',
      chain: 'stellar',
      network: Deno.env.get('STELLAR_NETWORK') ?? 'testnet',
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      ...meta,
    },
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${swr}`,
    },
  });
}

export function errorResponse(code: string, message: string, httpStatus: number): Response {
  return new Response(JSON.stringify({
    success: false,
    error: { code, message },
    meta: {
      version: '1.0.0',
      chain: 'stellar',
      network: Deno.env.get('STELLAR_NETWORK') ?? 'testnet',
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
    },
  }), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

export function paginate(total: number, page: number, limit: number): Record<string, unknown> {
  return {
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

export function parseIntParam(value: string | null, defaultVal: number, min: number, max: number): number {
  if (!value) return defaultVal;
  const n = parseInt(value, 10);
  if (isNaN(n)) return defaultVal;
  return Math.max(min, Math.min(max, n));
}

export function normalizeServices(raw: unknown): Array<{ name: string; endpoint: string; version?: string; description?: string; inputExample?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => s != null && typeof s === 'object')
    .map((s) => ({
      name: typeof s.name === 'string' ? s.name : 'unknown',
      endpoint: typeof s.endpoint === 'string' ? s.endpoint : '',
      version: typeof s.version === 'string' ? s.version : undefined,
      description: typeof s.description === 'string' ? s.description : undefined,
      inputExample: typeof s.inputExample === 'string' ? s.inputExample : undefined,
    }))
    .filter((s) => s.endpoint.length > 0);
}

function readUriData(row: Record<string, unknown>, field: string): unknown {
  const data = row.agent_uri_data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return (data as Record<string, unknown>)[field];
  }
  return undefined;
}

function sanitizeString(val: unknown, maxLen = 2048): string | null {
  if (typeof val !== 'string') return null;
  return val.slice(0, maxLen).replace(/[<>"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  );
}

export function formatAgent(row: Record<string, unknown>, scores?: Record<string, unknown> | null) {
  const result: Record<string, unknown> = {
    id: row.id,
    owner: row.owner,
    name: sanitizeString(readUriData(row, 'name')) ?? `Agent #${row.id}`,
    description: sanitizeString(readUriData(row, 'description')) ?? null,
    image: sanitizeString(readUriData(row, 'image'), 4096) ?? null,
    supportedTrust: row.supported_trust ?? [],
    x402Enabled: row.x402_enabled ?? false,
    mppEnabled: row.mpp_enabled ?? false,
    hasServices: (row.services && Array.isArray(row.services) && (row.services as unknown[]).length > 0) ?? false,
    createdAt: row.created_at,
  };

  if (scores) {
    (result as Record<string, unknown>).totalScore = scores.total_score ?? 0;
    (result as Record<string, unknown>).avgScore = scores.avg_score ?? 0;
    (result as Record<string, unknown>).feedbackCount = scores.feedback_count ?? 0;
    (result as Record<string, unknown>).uniqueClients = scores.unique_clients ?? 0;
  }

  return result;
}

export function formatAgentDetail(row: Record<string, unknown>, scores?: Record<string, unknown> | null, metadataRows?: Record<string, unknown>[]) {
  const result = formatAgent(row, scores) as Record<string, unknown>;
  (result as Record<string, unknown>).wallet = row.wallet ?? null;
  (result as Record<string, unknown>).agentUri = row.agent_uri ?? null;
  (result as Record<string, unknown>).services = normalizeServices(row.services);
  (result as Record<string, unknown>).metadata = (metadataRows ?? []).reduce((acc, m) => {
    (acc as Record<string, unknown>)[m.key as string] = m.value ?? '';
    return acc;
  }, {} as Record<string, unknown>);

  if (scores) {
    (result as Record<string, unknown>).scores = {
      total: scores.total_score ?? 0,
      average: scores.avg_score ?? 0,
      feedbackCount: scores.feedback_count ?? 0,
      uniqueClients: scores.unique_clients ?? 0,
    };
  }

  (result as Record<string, unknown>).resolveStatus = row.agent_uri_data ? 'ready' : row.agent_uri ? 'resolving' : 'no-uri';
  (result as Record<string, unknown>).createdLedger = row.created_ledger ?? null;
  (result as Record<string, unknown>).txHash = row.tx_hash ?? null;

  return result;
}
