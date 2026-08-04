import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const notesFile = process.argv[2];
const site = String(process.env.SIMPLEECODE_SITE || 'https://simpleecode.netlify.app').replace(/\/$/, '');

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('package.json must contain a stable semantic version');
}
if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(site)) {
  throw new Error('SIMPLEECODE_SITE must be an HTTPS origin without a path');
}
if (!notesFile) {
  throw new Error('a release-notes file is required');
}

const vsixName = `simpleecode-${version}.vsix`;
const vsixSource = resolve(root, vsixName);
const publish = resolve(root, 'publish');
const notesMarkdown = readFileSync(resolve(root, notesFile), 'utf8').trim();
const notes = notesMarkdown
  .split(/\n\s*\n/)
  .filter((paragraph) => !paragraph.startsWith('#'))
  .slice(0, 2)
  .join(' ')
  .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
  .replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 2_000);

if (!notes) {
  throw new Error('release notes must not be empty');
}

rmSync(publish, { recursive: true, force: true });
cpSync(resolve(root, 'site'), publish, { recursive: true });
mkdirSync(resolve(publish, 'assets', 'fonts'), { recursive: true });
copyFileSync(
  resolve(root, 'media', 'simpleecode-icon.svg'),
  resolve(publish, 'assets', 'simpleecode-icon.svg'),
);
cpSync(resolve(root, 'media', 'fonts'), resolve(publish, 'assets', 'fonts'), {
  recursive: true,
});
copyFileSync(vsixSource, resolve(publish, vsixName));

const indexPath = resolve(publish, 'index.html');
const index = readFileSync(indexPath, 'utf8')
  .replaceAll('__SIMPLEECODE_VERSION__', version)
  .replaceAll('__SIMPLEECODE_VSIX__', vsixName);
writeFileSync(indexPath, index);

const bytes = readFileSync(vsixSource);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest = {
  version,
  url: `${site}/${vsixName}`,
  sha256,
  notes,
};

writeFileSync(resolve(publish, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve(publish, 'SHA256SUMS.txt'), `${sha256}  ${vsixName}\n`);
writeFileSync(resolve(publish, '_redirects'), `/download  /${vsixName}  302\n`);

console.log(`✓ Prepared SimpleeCode ${version} release files in publish/`);
