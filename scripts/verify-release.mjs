import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
if (existsSync(resolve(publish, 'principles'))) throw new Error('website principles must not be published');
if (!index.includes('data-tour-next')) throw new Error('website tour demo has no next-file control');
if (!index.includes('data-explain-demo')) throw new Error('website explain demo has no trigger');
if (!index.includes('data-selection-explanation')) throw new Error('website explain demo has no result panel');

for (const [name, html] of [['index.html', index], ['404.html', notFound]]) {
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scriptTags.length !== 1 || !/\bsrc="\/site\.js"/.test(scriptTags[0][1])) {
    throw new Error(`${name} must load only the same-origin site.js file`);
  }
  if (scriptTags[0][2].trim()) throw new Error(`${name} must not contain inline JavaScript`);
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
if (directives.get('script-src')?.join(' ') !== "'self'") {
  throw new Error("Content-Security-Policy script-src must allow only 'self'");
}

console.log(`✓ Verified SimpleeCode ${version} release files`);
console.log(`  SHA-256 ${actualSha256}`);
