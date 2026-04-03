type EnvRuntime = typeof globalThis & {
  Deno?: { env?: { get?: (key: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

/**
 * Reads env vars in both Node and Deno runtimes.
 * Deno access is guarded because env permissions may be denied.
 */
export function env(key: string): string | undefined {
  const runtime = globalThis as EnvRuntime;

  try {
    if (runtime.process?.env?.[key] !== undefined) {
      return runtime.process.env[key];
    }
  } catch {
    // Ignore missing Node globals.
  }

  try {
    if (typeof runtime.Deno?.env?.get === 'function') {
      return runtime.Deno.env.get(key);
    }
  } catch {
    // Ignore missing Deno globals or denied env permissions.
  }

  return undefined;
}

export function requireEnv(key: string): string {
  const value = env(key);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
