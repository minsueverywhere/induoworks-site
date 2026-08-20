#!/usr/bin/env node
/**
 * Post-build step: Astro sometimes inlines small per-page scripts directly
 * into the HTML (both scripts we mark `is:inline` and ones it decides to
 * inline itself, like the contact form handler). A strict CSP without
 * 'unsafe-inline' blocks those unless explicitly allow-listed.
 *
 * Rather than weaken the policy with 'unsafe-inline', this scans every
 * built HTML file for inline <script> tags (any without a `src`), computes
 * the CSP `sha256-...` hash Chrome/Firefox actually check against, and
 * appends the full set to the `script-src` directive in dist/_headers.
 *
 * Runs automatically after `astro build` (see package.json `build` script).
 * Re-run any time inline script content changes — nothing to maintain by hand.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = join(process.cwd(), 'dist');

// Plain `output: 'static'` builds put _headers at dist/_headers. With the
// @astrojs/cloudflare adapter (which Cloudflare's Workers Builds pipeline
// applies automatically for git-connected Astro projects), static assets —
// including _headers — land under dist/client/ instead, alongside a
// separate dist/_worker.js/ for the server bundle. Support both so this
// script keeps working regardless of which mode Cloudflare decides to use.
const HEADERS_FILE = [join(DIST_DIR, 'client', '_headers'), join(DIST_DIR, '_headers')].find(existsSync);

if (!HEADERS_FILE) {
  console.error('[generate-csp] Could not find _headers in dist/ or dist/client/ — skipping.');
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

function extractInlineScripts(html) {
  const bodies = [];
  // Matches <script ...> ... </script> where the opening tag has no src="...".
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1];
    if (body.trim().length > 0) bodies.push(body);
  }
  return bodies;
}

function sha256Base64(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

const htmlFiles = walk(DIST_DIR);
const hashes = new Set();

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const body of extractInlineScripts(html)) {
    hashes.add(`'sha256-${sha256Base64(body)}'`);
  }
}

if (hashes.size === 0) {
  console.log('[generate-csp] No inline scripts found — nothing to add.');
  process.exit(0);
}

let headers = readFileSync(HEADERS_FILE, 'utf8');
const hashList = [...hashes].join(' ');

const beforeMarker = "script-src 'self' https://challenges.cloudflare.com";
if (!headers.includes(beforeMarker)) {
  console.error(`[generate-csp] Could not find "${beforeMarker}" in dist/_headers — CSP not updated.`);
  process.exit(1);
}

headers = headers.replace(beforeMarker, `${beforeMarker} ${hashList}`);
writeFileSync(HEADERS_FILE, headers);

console.log(`[generate-csp] Added ${hashes.size} inline script hash(es) to CSP.`);
