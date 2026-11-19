#!/usr/bin/env node
// Checks that everything `pnpm e2e` and `pnpm e2e:record` need is up, and prints the command that
// fixes each missing piece. The tutorial-story skill runs it first and then runs those commands.
//
// Usage: node e2e/scripts/preflight.mjs [--wait <seconds>]
//   --wait  keep polling the services until they answer or the time runs out (after starting
//           `pnpm dev` in the background, which takes a while to compile the first pages).
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(repoRoot, 'package.json'));

const SITE = process.env.SITE_APP_URL ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_APP_URL ?? 'http://localhost:3001';
const BACKEND = process.env.BACKEND_READY_URL ?? 'http://localhost:8000/readyz';

const waitIndex = process.argv.indexOf('--wait');
const waitSeconds = waitIndex > 0 ? Number(process.argv[waitIndex + 1]) || 0 : 0;

async function answers(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function seedLoaded() {
  // The mock seed's accounts are what the stories sign in with; the site's login page answering
  // is not enough. A GraphQL query that needs no sign-in tells an empty database apart.
  try {
    const res = await fetch(BACKEND.replace(/\/readyz$/, '/graphql'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ stations(limit: 1) { items { uuid } } }' }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json();
    return (body?.data?.stations?.items?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function browserReady() {
  // Recording needs Playwright's ffmpeg as well as Chromium; a page with recordVideo checks both.
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-preflight-'));
  try {
    // The same Playwright the stories run with (a global `playwright` may want other browsers).
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch();
    const context = await browser.newContext({ recordVideo: { dir } });
    await context.newPage();
    await context.close();
    await browser.close();
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A failed download leaves the folder with only a lock file, so look for the browser itself. */
function remotionBrowserDownloaded() {
  const root = path.join(repoRoot, 'node_modules', '.remotion', 'chrome-headless-shell');
  const walk = (dir, depth) => {
    if (depth > 4 || !fs.existsSync(dir)) return false;
    return fs.readdirSync(dir, { withFileTypes: true }).some((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name), depth + 1)
        : /^(chrome-headless-shell|headless_shell)(\.exe)?$/.test(e.name),
    );
  };
  return walk(root, 0);
}

const checks = [
  {
    name: 'frontend dependencies',
    ok: async () => fs.existsSync(path.join(repoRoot, 'Frontend', 'node_modules', '.modules.yaml')),
    fix: 'pnpm --dir Frontend install',
  },
  {
    name: 'root dependencies (Playwright, Remotion)',
    ok: async () => fs.existsSync(path.join(repoRoot, 'node_modules', '@playwright', 'test')),
    fix: 'pnpm install',
  },
  {
    name: 'Playwright Chromium and its video recorder',
    ok: browserReady,
    fix: 'pnpm exec playwright install chromium',
  },
  {
    name: "Remotion's browser (for pnpm video:render)",
    ok: async () => Boolean(process.env.REMOTION_BROWSER_EXECUTABLE) || remotionBrowserDownloaded(),
    fix: 'pnpm exec remotion browser ensure',
  },
  {
    name: `backend (${BACKEND})`,
    ok: () => answers(BACKEND),
    fix: 'pnpm dev   (run in the background; first time on this machine: pnpm run setup)',
    service: true,
  },
  {
    name: 'mock seed data',
    ok: seedLoaded,
    fix: 'pnpm run setup   (loads the RBAC roles and the mock scenarios)',
  },
  {
    name: `site (${SITE})`,
    ok: () => answers(`${SITE}/map`),
    fix: 'pnpm --dir Frontend dev   (run in the background; the backend alone: pnpm dev starts both)',
    service: true,
  },
  {
    name: `admin (${ADMIN})`,
    ok: () => answers(`${ADMIN}/login`),
    fix: 'pnpm --dir Frontend dev   (run in the background; pnpm dev starts it with the backend)',
    service: true,
  },
];

const deadline = Date.now() + waitSeconds * 1000;
let results;
for (;;) {
  results = [];
  for (const check of checks) results.push({ ...check, passed: await check.ok() });
  const servicesDown = results.some((r) => r.service && !r.passed);
  if (!servicesDown || Date.now() >= deadline) break;
  await new Promise((r) => setTimeout(r, 5000));
}

for (const r of results) {
  console.log(`${r.passed ? '✓' : '✗'} ${r.name}${r.passed ? '' : `\n    fix: ${r.fix}`}`);
}
const failed = results.filter((r) => !r.passed);
console.log(failed.length ? `\n${failed.length} not ready.` : '\nReady: pnpm e2e and pnpm e2e:record can run.');
process.exit(failed.length ? 1 : 0);
