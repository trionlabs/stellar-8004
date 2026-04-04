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

function normalizeIpfsPath(uri: string): string | null {
  const rawPath = uri
    .slice('ipfs://'.length)
    .replace(/^ipfs\//, '')
    .replace(/^\/+/, '');

  return rawPath.length > 0 ? rawPath : null;
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
