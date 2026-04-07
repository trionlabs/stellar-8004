const FETCH_TIMEOUT_MS = 10_000;
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

export async function resolveUri(uri: string): Promise<unknown | null> {
  if (typeof uri !== 'string' || uri.length === 0) {
    return null;
  }

  if (uri.startsWith('data:')) {
    return parseDataUri(uri);
  }

  if (!uri.startsWith('ipfs://')) {
    return fetchJson(uri);
  }

  const ipfsPath = normalizeIpfsPath(uri);
  if (!ipfsPath) {
    return null;
  }

  for (const gateway of IPFS_GATEWAYS) {
    const data = await fetchJson(`${gateway}${ipfsPath}`);
    if (data != null) {
      return data;
    }
  }

  return null;
}

function parseDataUri(uri: string): unknown | null {
  try {
    const commaIndex = uri.indexOf(',');
    if (commaIndex === -1) return null;

    const header = uri.slice(5, commaIndex).toLowerCase();
    const payload = uri.slice(commaIndex + 1);

    if (!header.includes('json')) return null;

    if (header.includes('base64')) {
      const binaryStr = atob(payload);
      const bytes = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }

    return JSON.parse(decodeURIComponent(payload));
  } catch {
    return null;
  }
}

function normalizeIpfsPath(uri: string): string | null {
  const rawPath = uri
    .slice('ipfs://'.length)
    .replace(/^ipfs\//, '')
    .replace(/^\/+/, '');

  return rawPath.length > 0 ? rawPath : null;
}

export function extractX402(uriData: unknown): boolean {
  if (!uriData || typeof uriData !== 'object' || Array.isArray(uriData)) return false;
  return (uriData as Record<string, unknown>).x402 === true;
}

export function extractSupportedTrust(uriData: unknown): string[] {
  if (!uriData || typeof uriData !== 'object' || Array.isArray(uriData)) return [];
  const record = uriData as Record<string, unknown>;
  const trust = record.supportedTrust;
  if (!Array.isArray(trust)) return [];
  return trust.filter((t): t is string => typeof t === 'string' && t.length > 0);
}

export function extractServices(uriData: unknown): unknown[] {
  if (!uriData || typeof uriData !== 'object' || Array.isArray(uriData)) return [];
  const record = uriData as Record<string, unknown>;

  // Spec format: "services" array with {name, endpoint, version}
  if (Array.isArray(record.services)) {
    return record.services.filter(
      (s) => s && typeof s === 'object' && 'endpoint' in (s as Record<string, unknown>),
    );
  }

  // Backward compat: "endpoints" array with {type, url} -> normalize to services format
  if (Array.isArray(record.endpoints)) {
    return record.endpoints
      .filter((e) => e && typeof e === 'object')
      .map((e) => {
        const ep = e as Record<string, unknown>;
        return {
          name: ep.type ?? ep.name ?? 'unknown',
          endpoint: ep.url ?? ep.endpoint ?? '',
          version: ep.version ?? undefined,
        };
      })
      .filter((s) => typeof s.endpoint === 'string' && s.endpoint.length > 0);
  }

  return [];
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}
