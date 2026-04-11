const FETCH_TIMEOUT_MS = 10_000;
// 1 MB cap on remote JSON responses. Resolved metadata is small by design
// (a couple of KB at most). The cap prevents JSON-bomb DoS via a malicious
// IPFS gateway returning a multi-MB payload that OOMs the Edge Function.
const MAX_RESPONSE_BYTES = 1_048_576;

// cloudflare-ipfs.com was retired in 2024 and now serves 410, so it was
// dropped from this list. dweb.link is Protocol Labs' rotating gateway.
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
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
  // Same MAX_RESPONSE_BYTES cap as remote fetches: a registered agent must
  // not be able to bypass the JSON-bomb cap by inlining the payload as a
  // data URI. The check is on the raw URI length, which is an upper bound
  // for the decoded payload (base64 encodes 3 bytes per 4 chars, so the
  // decoded payload is always <= the raw length).
  if (uri.length > MAX_RESPONSE_BYTES) return null;

  try {
    const commaIndex = uri.indexOf(',');
    if (commaIndex === -1) return null;

    const header = uri.slice(5, commaIndex).toLowerCase();
    const payload = uri.slice(commaIndex + 1);

    if (!header.includes('json')) return null;

    if (header.includes('base64')) {
      const binaryStr = atob(payload);
      const bytes = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
      if (bytes.length > MAX_RESPONSE_BYTES) return null;
      return JSON.parse(new TextDecoder().decode(bytes));
    }

    const decoded = decodeURIComponent(payload);
    if (decoded.length > MAX_RESPONSE_BYTES) return null;
    return JSON.parse(decoded);
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

/**
 * Returns true for hostnames that resolve to or directly name a private,
 * loopback, link-local, multicast, or otherwise non-public network. This is
 * a best-effort SSRF guard against agent metadata URIs that point at
 * internal infrastructure.
 *
 * Note: this only inspects the URL string. A DNS-rebinding attacker who
 * controls a public hostname can still aim at private space at fetch time.
 * Closing that gap requires DNS-then-connect-by-IP, which Deno's fetch
 * doesn't expose.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();

  // Bare hostnames that point at the host machine.
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (lower.endsWith('.local') || lower.endsWith('.internal')) return true;

  // IPv6 literals: strip surrounding brackets if present.
  const stripped = lower.startsWith('[') && lower.endsWith(']')
    ? lower.slice(1, -1)
    : lower;

  if (stripped === '::1' || stripped === '::') return true;
  if (
    stripped.startsWith('fe8') ||
    stripped.startsWith('fe9') ||
    stripped.startsWith('fea') ||
    stripped.startsWith('feb') // fe80::/10 link-local
  ) {
    return true;
  }
  if (stripped.startsWith('fc') || stripped.startsWith('fd')) return true; // fc00::/7 unique-local
  if (stripped.startsWith('ff')) return true; // multicast

  // IPv4 dotted quad.
  const ipv4Match = stripped.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = ipv4Match.slice(1).map(Number);
    if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast/reserved
  }

  return false;
}

/**
 * Streams a fetch response into memory but aborts if it exceeds maxBytes.
 * Returns null on cap-exceeded or any read failure. Used by fetchJson to
 * bound JSON parse memory.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declared = response.headers.get('content-length');
  if (declared != null) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > maxBytes) return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // best-effort cancel
      }
      return null;
    }
    chunks.push(value);
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return buf;
}

async function fetchJson(url: string): Promise<unknown | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    return null;
  }

  // Reject bare IPs as hostnames - legitimate agent metadata is served from
  // domains, not raw IPs. This blocks the simplest DNS rebinding vector
  // (attacker uses their own IP, then rebinds to 127.0.0.1).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.startsWith('[')) {
    return null;
  }

  try {
    // Don't follow redirects automatically - validate each hop.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });

    // Handle redirect manually: validate the Location header before following.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, url);
      } catch {
        return null;
      }
      if (redirectUrl.protocol !== 'https:' && redirectUrl.protocol !== 'http:') return null;
      if (isPrivateOrLoopbackHost(redirectUrl.hostname)) return null;
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(redirectUrl.hostname) || redirectUrl.hostname.startsWith('[')) return null;

      // Follow one redirect only.
      const redirectResponse = await fetch(redirectUrl.toString(), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!redirectResponse.ok) return null;
      const body = await readBodyWithLimit(redirectResponse, MAX_RESPONSE_BYTES);
      if (body == null) return null;
      return JSON.parse(new TextDecoder().decode(body));
    }

    if (!response.ok) {
      return null;
    }

    const body = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
    if (body == null) return null;

    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}
