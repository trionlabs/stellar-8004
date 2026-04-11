import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'

console.log('main function started')

const JWT_SECRET = Deno.env.get('JWT_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'

let SUPABASE_JWT_KEYS: ReturnType<typeof jose.createRemoteJWKSet> | null = null
if (SUPABASE_URL) {
  try {
    SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
      new URL('/auth/v1/.well-known/jwks.json', SUPABASE_URL)
    )
  } catch (e) {
    console.error('Failed to fetch JWKS from SUPABASE_URL:', e)
  }
}

function getAuthToken(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    throw new Error('Missing authorization header')
  }
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer') {
    throw new Error(`Auth header is not 'Bearer {token}'`)
  }
  return token
}

async function isValidLegacyJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET not available for HS256 token verification')
    return false
  }
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(JWT_SECRET)
  try {
    await jose.jwtVerify(jwt, secretKey)
  } catch (e) {
    console.error('Symmetric Legacy JWT verification error', e)
    return false
  }
  return true
}

async function isValidJWT(jwt: string): Promise<boolean> {
  if (!SUPABASE_JWT_KEYS) {
    console.error('JWKS not available for ES256/RS256 token verification')
    return false
  }
  try {
    await jose.jwtVerify(jwt, SUPABASE_JWT_KEYS)
  } catch (e) {
    console.error('Asymmetric JWT verification error', e)
    return false
  }
  return true
}

async function isValidHybridJWT(jwt: string): Promise<boolean> {
  const { alg: jwtAlgorithm } = jose.decodeProtectedHeader(jwt)
  if (jwtAlgorithm === 'HS256') {
    return await isValidLegacyJWT(jwt)
  }
  if (jwtAlgorithm === 'ES256' || jwtAlgorithm === 'RS256') {
    return await isValidJWT(jwt)
  }
  return false
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'OPTIONS' && VERIFY_JWT) {
    try {
      const token = getAuthToken(req)
      const isValid = await isValidHybridJWT(token)
      if (!isValid) {
        return new Response(JSON.stringify({ msg: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } catch (e) {
      console.error(e)
      return new Response(JSON.stringify({ msg: e.toString() }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const url = new URL(req.url)
  const { pathname } = url
  const path_parts = pathname.split('/')
  const service_name = path_parts[1]

  if (!service_name || service_name === '') {
    const error = { msg: 'missing function name in request' }
    return new Response(JSON.stringify(error), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const servicePath = `/home/deno/functions/${service_name}`

  try {
    return await dispatchToWorker(service_name, servicePath, req)
  } catch (e) {
    const error = { msg: e.toString() }
    return new Response(JSON.stringify(error), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------
//
// Why a pool: the previous implementation called EdgeRuntime.userWorkers.create
// on every request with a 60s workerTimeoutMs. The worker handled the request
// in ~1-3s and then sat idle for ~57s until edge-runtime force-killed it at the
// wall-clock limit, emitting "wall clock duration warning" + "early termination"
// log spam (one pair per invocation). With cron firing indexer + resolve-uris
// ~3x/min, that produced ~90 warnings per 30 min.
//
// The pool keeps one worker alive per service, refreshing it proactively at
// REFRESH_RATIO of its TTL so we never hit the hard wall-clock limit. Worker
// creation is deduplicated via an in-flight map so concurrent requests share a
// single create. If a fetch throws (worker crashed / OOM / TTL race), we
// invalidate the cached worker and retry once with a fresh one.

type WorkerConfig = {
  memoryLimitMb: number
  workerTimeoutMs: number
}

const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  memoryLimitMb: 256,
  workerTimeoutMs: 30 * 60 * 1000, // 30 min
}

const WORKER_CONFIG: Record<string, WorkerConfig> = {
  indexer: { memoryLimitMb: 256, workerTimeoutMs: 30 * 60 * 1000 },
  'resolve-uris': { memoryLimitMb: 256, workerTimeoutMs: 30 * 60 * 1000 },
  api: { memoryLimitMb: 256, workerTimeoutMs: 30 * 60 * 1000 },
  'indexer-health': { memoryLimitMb: 128, workerTimeoutMs: 30 * 60 * 1000 },
}

// Refresh worker once it has burned through this fraction of its TTL, so the
// new isolate is ready before edge-runtime force-terminates the old one.
const REFRESH_RATIO = 0.85

type CachedWorker = { worker: unknown; createdAt: number; cfg: WorkerConfig }

const workerCache = new Map<string, CachedWorker>()
const inflightCreate = new Map<string, Promise<CachedWorker>>()

function configFor(serviceName: string): WorkerConfig {
  return WORKER_CONFIG[serviceName] ?? DEFAULT_WORKER_CONFIG
}

function isFresh(entry: CachedWorker): boolean {
  const age = Date.now() - entry.createdAt
  return age < entry.cfg.workerTimeoutMs * REFRESH_RATIO
}

async function createCachedWorker(
  serviceName: string,
  servicePath: string
): Promise<CachedWorker> {
  const cfg = configFor(serviceName)
  const envVarsObj = Deno.env.toObject()
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]])

  const worker = await EdgeRuntime.userWorkers.create({
    servicePath,
    memoryLimitMb: cfg.memoryLimitMb,
    workerTimeoutMs: cfg.workerTimeoutMs,
    noModuleCache: false,
    importMapPath: null,
    envVars,
  })

  console.log(
    `[main] created worker for ${serviceName} (mem=${cfg.memoryLimitMb}MB ttl=${cfg.workerTimeoutMs}ms)`
  )
  return { worker, createdAt: Date.now(), cfg }
}

async function getWorker(
  serviceName: string,
  servicePath: string
): Promise<unknown> {
  const cached = workerCache.get(serviceName)
  if (cached && isFresh(cached)) {
    return cached.worker
  }

  let pending = inflightCreate.get(serviceName)
  if (!pending) {
    pending = createCachedWorker(serviceName, servicePath)
      .then((entry) => {
        workerCache.set(serviceName, entry)
        return entry
      })
      .finally(() => {
        inflightCreate.delete(serviceName)
      })
    inflightCreate.set(serviceName, pending)
  }

  const entry = await pending
  return entry.worker
}

async function dispatchToWorker(
  serviceName: string,
  servicePath: string,
  req: Request
): Promise<Response> {
  let worker = (await getWorker(serviceName, servicePath)) as {
    fetch: (r: Request) => Promise<Response>
  }
  try {
    return await worker.fetch(req)
  } catch (e) {
    // Worker likely died (TTL race, crash, OOM). Invalidate and retry once.
    console.warn(
      `[main] worker.fetch failed for ${serviceName}, retrying with fresh worker:`,
      e instanceof Error ? e.message : String(e)
    )
    workerCache.delete(serviceName)
    worker = (await getWorker(serviceName, servicePath)) as {
      fetch: (r: Request) => Promise<Response>
    }
    return await worker.fetch(req)
  }
}
