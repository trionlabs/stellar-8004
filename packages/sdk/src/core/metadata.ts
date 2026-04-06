import type { AgentFormData } from './types.js';

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

	return metadata;
}

const KNOWN_FIELDS = ['type', 'name', 'description', 'image', 'services', 'supportedTrust', 'x402', 'endpoints'];

/**
 * Build metadata JSON for edit mode.
 * Preserves unknown fields from the original metadata (e.g. custom extensions like
 * `license`, `category`) so they survive the edit round-trip without data loss.
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
	if (form.services.length > 0) metadata.services = form.services;
	if (form.supportedTrust.length > 0) metadata.supportedTrust = form.supportedTrust;
	if (form.x402Enabled) metadata.x402 = true;

	// Preserved fields go first, form fields override
	return { ...preserved, ...metadata };
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
