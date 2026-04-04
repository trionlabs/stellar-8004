import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { resolveUri } from '../_shared/uri.ts';

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 5;

type AgentRow = {
  id: number;
  agent_uri: string;
  uri_resolve_attempts: number | null;
};

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
    const { data, error } = await db
      .from('agents')
      .select('id, agent_uri, uri_resolve_attempts')
      .eq('resolve_uri_pending', true)
      .is('agent_uri_data', null)
      .not('agent_uri', 'is', null)
      .neq('agent_uri', '')
      .lt('uri_resolve_attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`Failed to load pending agents: ${error.message}`);
    }

    const agents = (data ?? []) as AgentRow[];
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
        const { error: updateError } = await db
          .from('agents')
          .update({
            agent_uri_data: uriData,
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
