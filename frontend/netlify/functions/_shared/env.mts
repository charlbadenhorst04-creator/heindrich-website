/**
 * Configuration lookup that works in both places these functions run.
 *
 * Netlify's runtime exposes environment variables through its own global;
 * plain Node - the test suite, and `netlify dev` - uses process.env. Read
 * per call rather than at import time, so a value set after the module
 * loads is still seen.
 */
export function env(key: string, fallback = ""): string {
  const fromNetlify = typeof Netlify !== "undefined" ? Netlify.env.get(key) : undefined;
  return fromNetlify ?? process.env[key] ?? fallback;
}

/** True when the variable is set to something other than an empty string. */
export function hasEnv(key: string): boolean {
  return Boolean(env(key));
}
