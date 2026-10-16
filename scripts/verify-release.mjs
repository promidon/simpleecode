import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const site = String(process.env.SIMPLEECODE_SITE || 'https://simpleecode.netlify.app').replace(/\/$/, '');
const vsixName = `simpleecode-${version}.vsix`;
const publish = resolve(root, 'publish');
const required = [
  vsixName,
  'index.html',
  '404.html',
  'styles.css',
  'site.js',
  'analytics.js',
  'latest.json',
  'SHA256SUMS.txt',
  '_redirects',
  'assets/simpleecode-icon.svg',
  'assets/fonts/atkinson-hyperlegible-latin-400-normal.woff2',
];

for (const path of required) {
  if (!existsSync(resolve(publish, path))) {
    throw new Error(`missing release file: publish/${path}`);
  }
}

const manifest = JSON.parse(readFileSync(resolve(publish, 'latest.json'), 'utf8'));
const bytes = readFileSync(resolve(publish, vsixName));
const actualSha256 = createHash('sha256').update(bytes).digest('hex');
const checksums = readFileSync(resolve(publish, 'SHA256SUMS.txt'), 'utf8').trim();
const index = readFileSync(resolve(publish, 'index.html'), 'utf8');
const notFound = readFileSync(resolve(publish, '404.html'), 'utf8');
const redirects = readFileSync(resolve(publish, '_redirects'), 'utf8').trim();
const netlifyConfig = readFileSync(resolve(root, 'netlify.toml'), 'utf8');

if (manifest.version !== version) throw new Error('manifest version does not match package.json');
if (manifest.url !== `${site}/${vsixName}`) throw new Error('manifest URL is not the canonical VSIX URL');
if (manifest.sha256 !== actualSha256) throw new Error('manifest checksum does not match the VSIX');
if (checksums !== `${actualSha256}  ${vsixName}`) throw new Error('SHA256SUMS.txt does not match the VSIX');
if (typeof manifest.notes !== 'string' || !manifest.notes.trim()) throw new Error('manifest release notes are empty');
if (statSync(resolve(publish, vsixName)).size > 100_000_000) throw new Error('VSIX exceeds the updater safety limit');
if (index.includes('__SIMPLEECODE_') || notFound.includes('__SIMPLEECODE_')) {
  throw new Error('website still contains release placeholders');
}
if (!index.includes('<html lang="en" data-theme="dark">') || !notFound.includes('<html lang="en" data-theme="dark">')) {
  throw new Error('website pages must default to the dark theme');
}
if (!index.includes(`href="/${vsixName}"`)) throw new Error('website has no direct VSIX download link');
if (redirects !== `/download  /${vsixName}  302`) throw new Error('website has no stable download redirect');
if (!index.includes('data-tour-next')) throw new Error('website tour demo has no next-file control');
if (!index.includes('data-explain-demo')) throw new Error('website explain demo has no trigger');
if (!index.includes('data-selection-explanation')) throw new Error('website explain demo has no result panel');
if (!index.includes('data-analytics-consent') || !index.includes('data-analytics-settings')) {
  throw new Error('website has no analytics consent and settings controls');
}
if (!index.includes('data-analytics-allow') || !index.includes('data-analytics-deny')) {
  throw new Error('website analytics consent must offer allow and decline actions');
}
if (index.includes('No analytics. No tracking.') || index.includes('No analytics or tracking')) {
  throw new Error('website contains an outdated no-analytics claim');
}

for (const [name, html] of [['index.html', index], ['404.html', notFound]]) {
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const scriptSources = scriptTags.map((match) => match[1].match(/\bsrc="([^"]+)"/)?.[1]).sort();
  if (scriptTags.length !== 2 || scriptSources.join(',') !== '/analytics.js,/site.js') {
    throw new Error(`${name} must load only the same-origin analytics.js and site.js files`);
  }
  if (scriptTags.some((match) => match[2].trim())) throw new Error(`${name} must not contain inline JavaScript`);
  if (html.includes('googletagmanager.com') || html.includes('google-analytics.com')) {
    throw new Error(`${name} must not load Google directly from HTML`);
  }
}

const csp = netlifyConfig.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1];
if (!csp) throw new Error('netlify.toml has no Content-Security-Policy');
const directives = new Map(csp.split(';').map((part) => {
  const [name, ...values] = part.trim().split(/\s+/);
  return [name, values];
}));
if (directives.get('default-src')?.join(' ') !== "'none'") {
  throw new Error("Content-Security-Policy default-src must be 'none'");
}
if (directives.get('script-src')?.join(' ') !== "'self' https://www.googletagmanager.com") {
  throw new Error('Content-Security-Policy script-src has an unexpected allowlist');
}
if (directives.get('connect-src')?.join(' ') !== 'https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com') {
  throw new Error('Content-Security-Policy connect-src has an unexpected allowlist');
}
if (directives.get('img-src')?.join(' ') !== "'self' https://*.google-analytics.com https://www.googletagmanager.com") {
  throw new Error('Content-Security-Policy img-src has an unexpected allowlist');
}
for (const forbiddenSource of ["'unsafe-inline'", "'unsafe-eval'", 'doubleclick.net', 'googlesyndication.com']) {
  if (csp.includes(forbiddenSource)) throw new Error(`Content-Security-Policy must not allow ${forbiddenSource}`);
}

if (process.argv.includes('--production')) {
  // Versioned VSIX URLs are cached as immutable, so production must keep serving the released bytes.
  const response = await fetch(`${site}/latest.json`, { cache: 'no-store', redirect: 'error' });
  let liveVersion = 'nothing';
  const kept = readdirSync(publish).filter((name) => /^simpleecode-\d+\.\d+\.\d+\.vsix$/.test(name) && name !== vsixName);
  if (response.status !== 404) {
    if (!response.ok) throw new Error(`could not read production latest.json (HTTP ${response.status})`);
    const live = await response.json();
    if (live.version === version && live.sha256 !== actualSha256) {
      throw new Error(`production already serves ${vsixName} with SHA-256 ${live.sha256}; rebuild publish/ with release:prepare-site from the released VSIX`);
    }
    if (live.version !== version && !kept.includes(`simpleecode-${live.version}.vsix`)) {
      throw new Error(`publish/ would drop simpleecode-${live.version}.vsix, which production serves; rebuild with release.sh so earlier releases are kept`);
    }
    liveVersion = live.version;
  }
  // A kept VSIX that production already serves must be the very same bytes.
  for (const name of kept) {
    const served = await fetch(`${site}/${name}`, { cache: 'no-store', redirect: 'error' });
    if (served.status === 404) continue;
    if (!served.ok) throw new Error(`could not read production ${name} (HTTP ${served.status})`);
    const servedSha256 = createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex');
    const keptSha256 = createHash('sha256').update(readFileSync(resolve(publish, name))).digest('hex');
    if (servedSha256 !== keptSha256) throw new Error(`${name} differs from the copy production serves`);
  }
  console.log(liveVersion === version ? `✓ ${vsixName} matches production` : `✓ ${vsixName} is new (production serves ${liveVersion})`);
  if (kept.length) console.log(`✓ Kept earlier releases unchanged: ${kept.join(', ')}`);
}

console.log(`✓ Verified SimpleeCode ${version} release files`);
console.log(`  SHA-256 ${actualSha256}`);
