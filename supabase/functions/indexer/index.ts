import { runIndexer } from '../_shared/indexer/indexer.ts';

const INDEXER_TIMEOUT_MS = 120_000;

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
    const startedAt = Date.now();
    const result = await Promise.race([
      runIndexer(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Indexer timeout')), INDEXER_TIMEOUT_MS),
      ),
    ]);
    const durationMs = Date.now() - startedAt;

    console.log(
      `Indexer completed in ${durationMs}ms: ${result.processed} processed, ${result.errors} errors`,
    );

    return json({ ok: true, ...result, durationMs });
  } catch (error) {
    console.error('Indexer fatal error:', error);

    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
