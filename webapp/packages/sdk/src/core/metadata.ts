import type { AgentFormData } from './types.js';

const MAX_URI_LENGTH = 8192;

export const SAFE_URI_SCHEMES = ['https://', 'http://', 'ipfs://', 'data:application/json'];

export function validateAgentUri(uri: string): void {
	if (uri.length > MAX_URI_LENGTH) {
		throw new Error(`Agent URI too large (max ${MAX_URI_LENGTH / 1024}KB)`);
	}

	if (!SAFE_URI_SCHEMES.some((scheme) => uri.startsWith(scheme))) {
		throw new Error('Agent URI must use https://, http://, ipfs://, or data: scheme');
	}
}

const ALLOWED_URL_SCHEMES = ['https://', 'http://', 'ipfs://'];

/** Validates that a URL uses a safe scheme (https, http, ipfs). Returns error message or empty string. */
export function validateUrl(url: string): string {
	if (!url) return '';
	if (ALLOWED_URL_SCHEMES.some((scheme) => url.startsWith(scheme))) return '';
	return 'URL must start with https://, http://, or ipfs://';
}

export function buildMetadataJson(form: AgentFormData): Record<string, unknown> {
	const metadata: Record<string, unknown> = {
		type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
		name: form.name
	};

	if (form.description) metadata.description = form.description;
	if (form.imageUrl) metadata.image = form.imageUrl;
	if (form.services.length > 0) metadata.services = form.services;
	if (form.supportedTrust.length > 0) metadata.supportedTrust = form.supportedTrust;
	if (form.x402Enabled) metadata.x402 = true;
	if (form.mppEnabled) metadata.mpp = true;

	validateMetadataJson(metadata);
	return metadata;
}

const KNOWN_FIELDS = ['type', 'name', 'description', 'image', 'services', 'supportedTrust', 'x402', 'mpp', 'endpoints'];

/**
 * Translate the legacy `endpoints: [{type, url}]` schema to the spec
 * `services: [{name, endpoint, version}]` schema. Returns null if the input
 * is not a non-empty array of valid endpoint records.
 */
function endpointsToServices(
	endpoints: unknown
): Array<{ name: string; endpoint: string; version?: string }> | null {
	if (!Array.isArray(endpoints) || endpoints.length === 0) return null;
	const out: Array<{ name: string; endpoint: string; version?: string }> = [];
	for (const e of endpoints) {
		if (!e || typeof e !== 'object') continue;
		const ep = e as Record<string, unknown>;
		const endpoint = typeof ep.url === 'string' ? ep.url
			: typeof ep.endpoint === 'string' ? ep.endpoint
			: '';
		if (!endpoint) continue;
		const name = typeof ep.type === 'string' ? ep.type
			: typeof ep.name === 'string' ? ep.name
			: 'unknown';
		const version = typeof ep.version === 'string' ? ep.version : undefined;
		out.push({ name, endpoint, ...(version ? { version } : {}) });
	}
	return out.length > 0 ? out : null;
}

/**
 * Build metadata JSON for edit mode.
 * Preserves unknown fields from the original metadata (e.g. custom extensions like
 * `license`, `category`) so they survive the edit round-trip without data loss.
 *
 * If the existing metadata uses the legacy `endpoints` schema and the form
 * has no services (e.g. the agent's URI was never resolved by the indexer
 * so `data.agent.services` came back empty), we automatically translate
 * `endpoints` -> `services`. This prevents the silent data loss where saving
 * an unedited legacy agent would drop its endpoint list.
 */
export function buildMetadataJsonForEdit(
	form: AgentFormData,
	existing: Record<string, unknown>
): Record<string, unknown> {
	// Collect unknown fields for preservation
	const preserved = Object.fromEntries(
		Object.entries(existing).filter(([k]) => !KNOWN_FIELDS.includes(k))
	);

	const metadata: Record<string, unknown> = {
		type: existing.type ?? 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
		name: form.name
	};

	if (form.description) metadata.description = form.description;
	if (form.imageUrl) metadata.image = form.imageUrl;
	if (form.services.length > 0) {
		metadata.services = form.services;
	} else {
		const fromLegacy = endpointsToServices(existing.endpoints);
		if (fromLegacy) metadata.services = fromLegacy;
	}
	if (form.supportedTrust.length > 0) metadata.supportedTrust = form.supportedTrust;
	if (form.x402Enabled) metadata.x402 = true;
	if (form.mppEnabled) metadata.mpp = true;

	// Preserved fields go first, form fields override
	return { ...preserved, ...metadata };
}

/**
 * Validates that a metadata JSON object conforms to the 8004 metadata spec.
 * Checks required fields (type, name) and field types.
 * Throws on invalid metadata.
 */
export function validateMetadataJson(json: Record<string, unknown>): void {
	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		throw new Error('Metadata must be a JSON object');
	}
	if (typeof json.type !== 'string' || !json.type) {
		throw new Error('Metadata must have a non-empty "type" string field');
	}
	if (typeof json.name !== 'string' || !json.name) {
		throw new Error('Metadata must have a non-empty "name" string field');
	}
	if (json.description !== undefined && typeof json.description !== 'string') {
		throw new Error('Metadata "description" must be a string');
	}
	if (json.image !== undefined && typeof json.image !== 'string') {
		throw new Error('Metadata "image" must be a string');
	}
	if (json.services !== undefined && !Array.isArray(json.services)) {
		throw new Error('Metadata "services" must be an array');
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	const binString = Array.from(bytes, (byte) =>
		String.fromCodePoint(byte),
	).join('');
	return btoa(binString);
}

export function toDataUri(json: Record<string, unknown>): string {
	const jsonStr = JSON.stringify(json);
	const base64 = bytesToBase64(new TextEncoder().encode(jsonStr));
	const uri = `data:application/json;base64,${base64}`;
	if (uri.length > 8192) {
		throw new Error(`Metadata URI too large (${uri.length} bytes). Maximum is 8KB. Reduce description length or number of services.`);
	}
	return uri;
}

export function getMetadataSize(json: Record<string, unknown>): number {
	return new TextEncoder().encode(JSON.stringify(json)).byteLength;
}

export function downloadMetadataJson(json: Record<string, unknown>, filename = 'agent-metadata.json'): void {
	if (typeof window === 'undefined') return;
	const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
