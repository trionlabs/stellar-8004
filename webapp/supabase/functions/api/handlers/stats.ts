import { createSupabaseAdmin, successWithCache, errorResponse } from '../lib/response.ts';

const STATS_SAMPLE_LIMIT = 5000;

export async function handleStats(): Promise<Response> {
  const db = createSupabaseAdmin();

  const [
    { count: totalAgents },
    { count: totalFeedbacks },
    { count: totalValidationsCount },
    { data: scores },
    { count: servicesCount },
    { count: x402Count },
    { data: protocolData },
    { data: trustData },
  ] = await Promise.all([
    db.from('agents').select('*', { count: 'exact', head: true }),
    db.from('feedback').select('*', { count: 'exact', head: true }),
    db.from('validations').select('*', { count: 'exact', head: true }),
    db.from('leaderboard_scores').select('feedback_count, avg_score, unique_clients').limit(STATS_SAMPLE_LIMIT),
    db.from('agents').select('id', { count: 'exact', head: true }).neq('services', '[]').neq('services', null),
    db.from('agents').select('id', { count: 'exact', head: true }).eq('x402_enabled', true),
    db.from('agents').select('services').limit(STATS_SAMPLE_LIMIT),
    db.from('agents').select('supported_trust').limit(STATS_SAMPLE_LIMIT),
  ]);

  const totalValidations = totalValidationsCount ?? 0;
  let totalUniqueClients = 0;
  let avgScoreSum = 0;
  let scoreCount = 0;

  for (const s of scores ?? []) {
    totalUniqueClients += s.unique_clients ?? 0;
    if (s.avg_score != null) {
      avgScoreSum += s.avg_score;
      scoreCount++;
    }
  }

  const avgFeedbackScore = scoreCount > 0 ? Math.round((avgScoreSum / scoreCount) * 10) / 10 : 0;

  const protocolDist: Record<string, number> = { a2a: 0, mcp: 0, other: 0 };
  for (const a of protocolData ?? []) {
    const services = a.services;
    if (Array.isArray(services)) {
      for (const s of services) {
        const name = (s.name ?? '').toLowerCase();
        if (name === 'a2a') protocolDist.a2a++;
        else if (name === 'mcp') protocolDist.mcp++;
        else protocolDist.other++;
      }
    }
  }

  const trustDist: Record<string, number> = { reputation: 0, validation: 0, tee: 0 };
  for (const a of trustData ?? []) {
    const trust = a.supported_trust;
    if (Array.isArray(trust)) {
      for (const t of trust) {
        const tl = t.toLowerCase();
        if (tl === 'reputation') trustDist.reputation++;
        else if (tl === 'validation') trustDist.validation++;
        else if (tl === 'tee-attestation' || tl === 'tee') trustDist.tee++;
      }
    }
  }

  return successWithCache({
    totalAgents: totalAgents ?? 0,
    totalFeedbacks: totalFeedbacks ?? 0,
    totalValidations,
    totalUniqueClients,
    averageFeedbackScore: avgFeedbackScore,
    agentsWithServices: servicesCount ?? 0,
    agentsWithX402: x402Count ?? 0,
    network: Deno.env.get('STELLAR_NETWORK') ?? 'testnet',
    protocolDistribution: protocolDist,
    trustDistribution: trustDist,
  }, 60, 300);
}
