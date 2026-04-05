import { createClient } from '@supabase/supabase-js';
import type { Database } from '@stellar8004/db';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export function createServerSupabase() {
	// Seçenek C: prefer private SUPABASE_URL (internal Docker network)
	// Fallback to PUBLIC_ for local dev compatibility
	const url = env.SUPABASE_URL ?? publicEnv.PUBLIC_SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY ?? publicEnv.PUBLIC_SUPABASE_ANON_KEY;
	return createClient<Database>(url, key);
}
