import { runTests } from '@vscode/test-electron';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const testRoot = await mkdtemp(join(tmpdir(), 'simpleecode-host-test-'));
const workspace = join(testRoot, 'fixture.code-workspace');
await writeFile(workspace, JSON.stringify({ folders: [], settings: { 'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false, 'simpleecode.updates.checkOnStartup': false } }));
await runTests({
  vscodeExecutablePath: process.env.SIMPLEECODE_TEST_CODE || '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
  extensionDevelopmentPath: resolve('.'), extensionTestsPath: resolve('out/integration/index.js'),
  extensionTestsEnv: { SIMPLEECODE_TEST_NODE: process.execPath, SIMPLEECODE_TEST_ROOT: resolve('.') },
  launchArgs: [workspace, '--user-data-dir', join(testRoot, 'user'), '--extensions-dir', join(testRoot, 'extensions'),
    '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-telemetry'],
});
console.log('Isolated extension-host tests passed. Test profile:', testRoot);
