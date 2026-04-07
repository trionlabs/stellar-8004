import { createClient } from '@supabase/supabase-js';
import type { Database } from '@stellar8004/db';
import { env } from '$env/dynamic/public';

export function createSupabase() {
	return createClient<Database>(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY);
}
