/**
 * Every page must survive being opened directly.
 *
 * The storefront is a single-page app, so the server has to hand back
 * index.html for any address React Router knows about. Netlify does not do
 * that by default: without a fallback rule it looks for a real file at
 * each path, finds none, and answers 404. That broke every shared product
 * link, every bookmark past the homepage, and - how it was noticed - the
 * page Payfast returns a paying customer to after they have handed over
 * their money.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../../../..");

async function netlifyToml(): Promise<string> {
  return readFile(path.join(repoRoot, "netlify.toml"), "utf-8");
}

test("netlify.toml serves index.html for any client-side route", async () => {
  const toml = await netlifyToml();

  const blocks = toml.split("[[redirects]]").slice(1);
  const fallback = blocks.find(
    (block) =>
      /from\s*=\s*"\/\*"/.test(block) &&
      /to\s*=\s*"\/index\.html"/.test(block) &&
      /status\s*=\s*200/.test(block),
  );

  assert.ok(
    fallback,
    'netlify.toml has no "/*" -> "/index.html" 200 rule, so every address ' +
      "except the homepage will answer 404 on a direct visit",
  );

  // Forcing it would shadow the API functions and the built assets.
  assert.ok(
    !/force\s*=\s*true/.test(fallback),
    "the fallback must not be forced, or it would swallow /api and /assets",
  );
});

test("every route the app defines is covered by that fallback", async () => {
  // Reads the routes from the router itself, so a page added later is
  // included without anyone remembering to update this test.
  const app = await readFile(path.join(repoRoot, "frontend/src/App.tsx"), "utf-8");
  const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);

  assert.ok(routes.length >= 5, `expected the app's routes, found ${routes.length}`);
  assert.ok(routes.includes("/order-success"), "the Payfast return page must be a route");

  const toml = await netlifyToml();
  const rules = [...toml.matchAll(/from\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

  for (const route of routes) {
    if (route === "*") continue;
    const covered = rules.some((rule) =>
      rule === "/*" ? true : rule.replace(/\*$/, "") === route,
    );
    assert.ok(covered, `no rule serves ${route} on a direct visit`);
  }
});
