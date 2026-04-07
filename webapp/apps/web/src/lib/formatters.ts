const SAFE_IMAGE_SCHEMES = ['https://', 'ipfs://', 'data:image/'];

/**
 * Sanitize image URLs to prevent tracking pixels and data: URI abuse.
 * Only allows https://, ipfs://, and data:image/ schemes.
 * Returns a placeholder for unsafe URLs.
 */
export function sanitizeImageUrl(url: string | null | undefined): string {
	if (!url) return '';
	const lower = url.trim().toLowerCase();
	if (SAFE_IMAGE_SCHEMES.some((s) => lower.startsWith(s))) return url;
	return '';
}

export function shortAddress(value: string): string {
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export const scoreFormatter = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 0,
	maximumFractionDigits: 2
});

export const statFormatter = new Intl.NumberFormat('en-US');

export const dateFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC'
});

export const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	timeZone: 'UTC'
});
