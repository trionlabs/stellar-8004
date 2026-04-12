import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@stellar8004/db';
import { env } from '$env/dynamic/private';

// Module-level singletons — one client per role, reused across requests.
let _serviceClient: SupabaseClient<Database> | null = null;
let _anonClient: SupabaseClient<Database> | null = null;

/**
 * Service-role client — bypasses RLS. Use ONLY for indexer writes
 * and server-side load functions that need cross-table access.
 * NEVER use in public-facing API endpoints.
 */
export function createServerSupabase(): SupabaseClient<Database> {
	if (_serviceClient) return _serviceClient;
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server-only env vars)');
	}
	_serviceClient = createClient<Database>(url, key);
	return _serviceClient;
}

/**
 * Anon-role client — respects RLS. Use for public-facing API endpoints
 * (e.g. /api/agents/count). Can only read tables with public SELECT policies.
 */
export function createAnonSupabase(): SupabaseClient<Database> {
	if (_anonClient) return _anonClient;
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_ANON_KEY;
	if (!url || !key) {
		throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY (server-only env vars)');
	}
	_anonClient = createClient<Database>(url, key);
	return _anonClient;
}
