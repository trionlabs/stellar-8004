import { createClient } from '@supabase/supabase-js';
import type { Database } from '@stellar8004/db';
import { env } from '$env/dynamic/public';

export function createSupabase() {
	const url = env.PUBLIC_SUPABASE_URL;
	const anonKey = env.PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !anonKey) {
		throw new Error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY');
	}
	return createClient<Database>(url, anonKey);
}
