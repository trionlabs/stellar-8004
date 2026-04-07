import { type SupabaseClient } from '@supabase/supabase-js';

import { checkRateLimit as sharedCheckRateLimit } from '../../_shared/rate-limit.ts';

const LIMIT_PER_MINUTE = 30;

export function checkRateLimit(db: SupabaseClient, ip: string) {
  return sharedCheckRateLimit(db, ip, LIMIT_PER_MINUTE);
}