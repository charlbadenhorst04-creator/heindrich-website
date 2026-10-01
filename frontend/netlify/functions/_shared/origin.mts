/**
 * The public address of this shop, as seen by the customer making a request.
 *
 * Stitch needs an absolute address to send the customer back to. These used to be environment variables that
 * had to be edited by hand when the shop moved onto its own domain - and
 * forgetting one meant customers paid and the order was never marked paid.
 *
 * Now the address is taken from the request itself: a customer checking out
 * on meravo.co.za is sent back to meravo.co.za, one on meravo-store.netlify.app
 * to that. The domain the customer reached is, by definition, one that works.
 *
 * The host is only trusted when it is one this site actually answers to,
 * named by Netlify's own variables. Netlify only routes a request to these
 * functions when its host belongs to the site, so this is belt and braces -
 * but a forged Host header must never be able to point a payment provider's
 * confirmation at somebody else's server.
 */
import { env } from "./env.mts";

function hostOf(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Every host this deployment legitimately serves. */
export function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  // Netlify sets these for every deploy: the primary domain, this deploy's
  // own address, and the branch address.
  for (const name of ["URL", "DEPLOY_URL", "DEPLOY_PRIME_URL", "STORE_URL"]) {
    const host = hostOf(env(name));
    if (host) hosts.add(host);
  }
  // The permanent <site>.netlify.app address, which no variable above names
  // once a custom domain becomes primary.
  const siteName = env("SITE_NAME").trim();
  if (siteName) hosts.add(`${siteName.toLowerCase()}.netlify.app`);
  // Anything else the shop is served on (a www alias, say), comma-separated.
  for (const extra of env("ALLOWED_HOSTS").split(",")) {
    const host = hostOf(extra.trim());
    if (host) hosts.add(host);
  }
  return hosts;
}

function isLocal(host: string): boolean {
  const name = host.split(":")[0];
  return name === "localhost" || name === "127.0.0.1";
}

/**
 * The origin to build return and confirmation addresses on.
 *
 * Prefers the address the customer is actually on; falls back to the
 * configured one when the request's host is not recognised.
 */
export function siteOrigin(req: Request): string {
  try {
    const url = new URL(req.url);
    const host = url.host.toLowerCase();
    if (allowedHosts().has(host)) return `https://${host}`;
    // Local development and the test suite run over plain http.
    if (isLocal(host)) return `${url.protocol}//${host}`;
  } catch {
    // Fall through to the configured address.
  }
  return (env("STORE_URL") || env("URL")).replace(/\/+$/, "");
}

/** An absolute address on the origin the customer is using. */
export function providerUrl(req: Request, path: string): string {
  return `${siteOrigin(req)}${path}`;
}
