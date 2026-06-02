// AUTO-GENERATED from packages/indexer/src/env.ts — DO NOT EDIT.
// Regenerate with: pnpm --filter @stellar8004/indexer sync:shared

type EnvRuntime = typeof globalThis & {
  Deno?: { env?: { get?: (key: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

/**
 * Reads env vars in both Node and Deno runtimes. Deno is checked FIRST: the
 * deployed edge copy runs under Deno, and its npm-compat layer can expose a
 * partial `process.env` that would otherwise shadow the real `Deno.env` value.
 * Under Node there is no `Deno` global, so it falls through to `process.env`.
 * An empty string is treated as "not set" so a polyfilled blank does not mask
 * a real value in the other runtime.
 */
export function env(key: string): string | undefined {
  const runtime = globalThis as EnvRuntime;

  try {
    if (typeof runtime.Deno?.env?.get === 'function') {
      const value = runtime.Deno.env.get(key);
      if (value !== undefined && value !== '') {
        return value;
      }
    }
  } catch {
    // Ignore missing Deno globals or denied env permissions.
  }

  try {
    const value = runtime.process?.env?.[key];
    if (value !== undefined && value !== '') {
      return value;
    }
  } catch {
    // Ignore missing Node globals.
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
