import { checkRateLimit } from './lib/rate-limit.ts';
import { createSupabaseAdmin, errorResponse } from './lib/response.ts';
import { handleAgentsList, handleAgentDetail, handleAgentFeedback } from './handlers/agents.ts';
import { handleSearch } from './handlers/search.ts';
import { handleAccounts } from './handlers/accounts.ts';
import { handleStats } from './handlers/stats.ts';
import { handleHealth } from './handlers/health.ts';

const db = createSupabaseAdmin();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only GET requests are supported', 405);
  }

  // Prefer proxy-set headers (trusted) over client-controllable ones.
  // Order: cf-connecting-ip (Cloudflare) > x-real-ip (nginx/Dokploy) > x-forwarded-for (last resort)
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const rateLimit = await checkRateLimit(db, ip);

  const rateHeaders: Record<string, string> = {
    'X-RateLimit-Limit': '30',
    'X-RateLimit-Remaining': String(rateLimit.remaining),
    'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
  };

  if (!rateLimit.allowed) {
    const resp = errorResponse('RATE_LIMITED', 'Too many requests. Try again later.', 429);
    for (const [key, value] of Object.entries(rateHeaders)) {
      resp.headers.set(key, value);
    }
    return resp;
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const parts = path.split('/').filter(Boolean);

  try {
    let response: Response;

    if (path === '/health' || path === '/health/') {
      response = await handleHealth();
    } else if (path === '/stats' || path === '/stats/') {
      response = await handleStats();
    } else if (path === '/search' || path === '/search/') {
      response = await handleSearch(url);
    } else if (parts[0] === 'agents' && parts.length === 1) {
      response = await handleAgentsList(url);
    } else if (parts[0] === 'agents' && parts.length === 3 && parts[2] === 'feedback') {
      response = await handleAgentFeedback(parts[1], url);
    } else if (parts[0] === 'agents' && parts.length === 2) {
      response = await handleAgentDetail(parts[1]);
    } else if (parts[0] === 'accounts' && parts.length === 3 && parts[2] === 'agents') {
      response = await handleAccounts(parts[1], url);
    } else {
      response = errorResponse('NOT_FOUND', 'Endpoint not found', 404);
    }

    for (const [key, value] of Object.entries(rateHeaders)) {
      response.headers.set(key, value);
    }

    return response;
  } catch (err) {
    console.error('API error:', err);
    const resp = errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
    for (const [key, value] of Object.entries(rateHeaders)) {
      resp.headers.set(key, value);
    }
    return resp;
  }
});