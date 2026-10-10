/** Bounded, resumable historical scan. Re-run with the same BACKFILL_JOB_ID
 * after the 60s historical cooldown. A job's first run fixes its target ledger.
 * Both sources use the indexer package's interpretation and fenced SQL writer.
 * See docs/operations/indexer-cutover.md before upgrading a populated database.
 */
import { getConfig } from '../packages/indexer/src/config.js';
import { runBackfill } from '../packages/indexer/src/backfill.js';

function integer(name: string, fallback?: number): number | undefined {
  const raw = process.env[name];
  if (raw == null) return fallback;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new Error(`${name} must be an integer`);
  return Number(raw);
}

async function main() {
  const base = getConfig();
  // Preserve the old script's documented environment aliases. Deployment
  // binding rejects overrides that point an existing database elsewhere.
  const config = {
    ...base,
    rpcUrl: process.env.STELLAR_RPC_URL || base.rpcUrl,
    deployLedger: integer('DEPLOY_LEDGER', base.deployLedger)!,
    contracts: {
      identity: process.env.IDENTITY_REGISTRY || base.contracts.identity,
      reputation: process.env.REPUTATION_REGISTRY || base.contracts.reputation,
      validation: process.env.VALIDATION_REGISTRY || base.contracts.validation,
    },
  };
  process.env.SUPABASE_URL ||= 'http://localhost:54321';
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Backfill interrupted'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const result = await runBackfill({
      config,
      jobId: process.env.BACKFILL_JOB_ID || 'default',
      startLedger: Math.max(1, config.deployLedger),
      targetLedger: integer('END_LEDGER'),
      signal: controller.signal,
    });
    console.log(JSON.stringify(result, null, 2));
    // A partial run is a checkpointed continuation, never a success report for
    // a complete history. 75 is EX_TEMPFAIL (contention/cooldown/continuation).
    if (!result.done) process.exitCode = 75;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
