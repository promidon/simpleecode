import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swiftEngineStatus } from '../context/swiftEngineStatus';

test('swiftEngineStatus: buildServer.json means the engine is ready', () => {
  const info = swiftEngineStatus({ hasPackageSwift: false, hasBuildServerJson: true });
  assert.equal(info.status, 'xcode-ready');
});

test('swiftEngineStatus: Package.swift means SPM works out of the box', () => {
  const info = swiftEngineStatus({ hasPackageSwift: true, hasBuildServerJson: false });
  assert.equal(info.status, 'spm');
});

test('swiftEngineStatus: bare Xcode project needs setup, with a -project command', () => {
  const info = swiftEngineStatus({
    hasPackageSwift: false,
    hasBuildServerJson: false,
    xcodeProject: 'here.xcodeproj',
  });
  assert.equal(info.status, 'xcode-needs-setup');
  assert.equal(
    info.setupCommand,
    'xcode-build-server config -project here.xcodeproj -scheme here',
  );
});

test('swiftEngineStatus: a workspace is preferred over a project', () => {
  const info = swiftEngineStatus({
    hasPackageSwift: false,
    hasBuildServerJson: false,
    xcodeProject: 'here.xcodeproj',
    xcodeWorkspace: 'here.xcworkspace',
    scheme: 'HereApp',
  });
  assert.ok(info.setupCommand?.includes('-workspace here.xcworkspace'));
  assert.ok(info.setupCommand?.includes('-scheme HereApp'));
});

test('swiftEngineStatus: nothing Swift detected', () => {
  const info = swiftEngineStatus({ hasPackageSwift: false, hasBuildServerJson: false });
  assert.equal(info.status, 'unknown');
});
