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

if (manifest.version !== version) throw new Error('manifest version does not match package.json');
if (manifest.url !== `${site}/${vsixName}`) throw new Error('manifest URL is not the canonical VSIX URL');
if (manifest.sha256 !== actualSha256) throw new Error('manifest checksum does not match the VSIX');
if (checksums !== `${actualSha256}  ${vsixName}`) throw new Error('SHA256SUMS.txt does not match the VSIX');
if (typeof manifest.notes !== 'string' || !manifest.notes.trim()) throw new Error('manifest release notes are empty');
if (statSync(resolve(publish, vsixName)).size > 100_000_000) throw new Error('VSIX exceeds the updater safety limit');
if (index.includes('__SIMPLEECODE_')) throw new Error('website still contains release placeholders');
if (!index.includes('href="/download"')) throw new Error('website has no stable download link');

console.log(`✓ Verified SimpleeCode ${version} release files`);
console.log(`  SHA-256 ${actualSha256}`);
