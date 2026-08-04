import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  assetFromManifest,
  compareVersions,
  decideUpdate,
  isTrustedUpdateAsset,
  versionFromManifest,
} from '../update/versionCheck';

test('compareVersions orders semver correctly', () => {
  assert.equal(compareVersions('0.0.1', '0.0.2'), -1);
  assert.equal(compareVersions('0.2.0', '0.0.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0'), 0); // missing parts are zero
  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1); // leading v tolerated
});

test('versionFromManifest reads package.json, fails soft on junk', () => {
  assert.equal(versionFromManifest('{"version": "0.3.1"}'), '0.3.1');
  assert.equal(versionFromManifest('not json'), undefined);
  assert.equal(versionFromManifest('{"name": "x"}'), undefined);
  assert.equal(versionFromManifest('{"version": "unversioned"}'), undefined);
});

test('decideUpdate: newer source → update; equal/older/unreadable → silent', () => {
  assert.deepEqual(decideUpdate('0.0.1', '{"version": "0.0.2"}'), {
    updateAvailable: true,
    latest: '0.0.2',
    current: '0.0.1',
  });
  assert.equal(decideUpdate('0.0.2', '{"version": "0.0.2"}').updateAvailable, false);
  assert.equal(decideUpdate('0.0.3', '{"version": "0.0.2"}').updateAvailable, false);
  assert.equal(decideUpdate('0.0.1', undefined).updateAvailable, false);
  assert.equal(decideUpdate('0.0.1', 'garbage').updateAvailable, false);
});

test('update assets require a valid checksum and the configured HTTPS origin', () => {
  const hash = 'a'.repeat(64);
  const asset = assetFromManifest(JSON.stringify({
    version: '1.0.0',
    url: 'https://updates.example/app.vsix',
    sha256: hash,
  }));
  assert.equal(asset.sha256, hash);
  assert.equal(
    isTrustedUpdateAsset('https://updates.example/latest.json', asset.url!),
    true,
  );
  assert.equal(
    isTrustedUpdateAsset('https://updates.example/latest.json', 'https://evil.example/app.vsix'),
    false,
  );
  assert.equal(assetFromManifest('{"sha256":"bad"}').sha256, undefined);
});
