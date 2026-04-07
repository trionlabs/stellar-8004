import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { resolveUri, extractSupportedTrust, extractServices, extractX402 } from '../_shared/uri.ts';

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 5;

type AgentRow = {
  id: number;
  agent_uri: string;
  uri_resolve_attempts: number | null;
  last_resolve_attempt_at: string | null;
};

/**
 * Exponential backoff: wait pow(2, attempts) minutes between retries.
 * - attempt 0 (never tried): eligible immediately
 * - attempt 1: wait 2 minutes
 * - attempt 2: wait 4 minutes
 * - attempt 3: wait 8 minutes
 * - attempt 4: wait 16 minutes
 * - attempt 5 (last): wait 32 minutes
 *
 * Without this, a transient gateway outage burns through MAX_ATTEMPTS in
 * a few seconds and the agent is permanently marked as failed.
 */
function isEligibleForRetry(row: AgentRow): boolean {
  const attempts = row.uri_resolve_attempts ?? 0;
  if (attempts === 0) return true;
  if (!row.last_resolve_attempt_at) return true;
  const lastMs = Date.parse(row.last_resolve_attempt_at);
  if (!Number.isFinite(lastMs)) return true;
  const waitMs = Math.pow(2, attempts) * 60_000;
  return Date.now() - lastMs >= waitMs;
}

function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function log(entry: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    ...entry,
  };

  console.log(JSON.stringify(payload));
}

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

Deno.serve(async (request: Request) => {
  const authHeader = request.headers.get('Authorization');
  const expectedKey = Deno.env.get('INDEXER_SECRET');

  if (!expectedKey || expectedKey.length < 16) {
    return json({ ok: false, error: 'INDEXER_SECRET not configured' }, { status: 503 });
  }

  if (authHeader !== `Bearer ${expectedKey}`) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createSupabaseAdmin();
    // Pull a slightly larger candidate set than BATCH_SIZE so the in-memory
    // backoff filter still has BATCH_SIZE worth of work to do most of the
    // time. Sort by oldest-attempt-first so agents that have been waiting
    // longest get the next slot.
    const { data, error } = await db
      .from('agents')
      .select('id, agent_uri, uri_resolve_attempts, last_resolve_attempt_at')
      .eq('resolve_uri_pending', true)
      .is('agent_uri_data', null)
      .not('agent_uri', 'is', null)
      .neq('agent_uri', '')
      .lt('uri_resolve_attempts', MAX_ATTEMPTS)
      .order('last_resolve_attempt_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE * 4);

    if (error) {
      throw new Error(`Failed to load pending agents: ${error.message}`);
    }

    // Filter out agents whose backoff window hasn't elapsed yet, then take
    // the first BATCH_SIZE eligible candidates.
    const eligible = ((data ?? []) as AgentRow[])
      .filter(isEligibleForRetry)
      .slice(0, BATCH_SIZE);
    const agents = eligible;
    const results = await Promise.all(
      agents.map(async (agent) => ({
        agent,
        uriData: await resolveUri(agent.agent_uri),
      })),
    );

    let resolved = 0;
    let failed = 0;
    let exhausted = 0;

    for (const { agent, uriData } of results) {
      if (uriData != null) {
        const supportedTrust = extractSupportedTrust(uriData);
        const services = extractServices(uriData);
        const x402Enabled = extractX402(uriData);

        const { error: updateError } = await db
          .from('agents')
          .update({
            agent_uri_data: uriData,
            supported_trust: supportedTrust,
            services: services,
            x402_enabled: x402Enabled,
            uri_resolve_attempts: 0,
            resolve_uri_pending: false,
          })
          .eq('id', agent.id)
          .eq('agent_uri', agent.agent_uri);

        if (updateError) {
          throw new Error(`Failed to store resolved URI for agent ${agent.id}: ${updateError.message}`);
        }

        resolved++;
        continue;
      }

      const nextAttempts = (agent.uri_resolve_attempts ?? 0) + 1;
      const stillPending = nextAttempts < MAX_ATTEMPTS;
      const { error: updateError } = await db
        .from('agents')
        .update({
          uri_resolve_attempts: nextAttempts,
          resolve_uri_pending: stillPending,
          last_resolve_attempt_at: new Date().toISOString(),
        })
        .eq('id', agent.id)
        .eq('agent_uri', agent.agent_uri);

      if (updateError) {
        throw new Error(`Failed to update retry count for agent ${agent.id}: ${updateError.message}`);
      }

      failed++;
      if (!stillPending) {
        exhausted++;
      }
    }

    log({
      level: 'info',
      msg: 'resolve-uris batch complete',
      checked: agents.length,
      resolved,
      failed,
      exhausted,
      extractedTrust: results.filter(({ uriData }) => uriData != null && extractSupportedTrust(uriData).length > 0).length,
      extractedServices: results.filter(({ uriData }) => uriData != null && extractServices(uriData).length > 0).length,
    });

    return json({
      ok: true,
      checked: agents.length,
      resolved,
      failed,
      exhausted,
      batchSize: BATCH_SIZE,
      maxAttempts: MAX_ATTEMPTS,
    });
  } catch (error) {
    log({
      level: 'error',
      msg: 'resolve-uris failed',
      error: error instanceof Error ? error.message : String(error),
    });

    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
