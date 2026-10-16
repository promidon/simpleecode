// Installs only into a fresh test profile. Never uses the person's normal profile.
import { resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const candidate = process.argv[2];
const baseline = process.argv[3];
if (!candidate) { throw new Error('Usage: node scripts/test-installed.mjs candidate.vsix [baseline.vsix]'); }
const root = await mkdtemp(join(tmpdir(), 'simpleecode-install-test-'));
const executable = process.env.SIMPLEECODE_TEST_CODE || '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
const profileArgs = ['--user-data-dir', join(root, 'user'), '--extensions-dir', join(root, 'extensions')];
await mkdir(join(root, 'user', 'User'), { recursive: true });
await writeFile(join(root, 'user', 'User', 'settings.json'), JSON.stringify({
  'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false,
  'simpleecode.updates.checkOnStartup': false, 'simpleecode.privacy.showPromptBeforeSending': true,
  'simpleecode.privacy.defaultScope': 'selection_only',
}));
const workspace = join(root, 'fixture.code-workspace');
await writeFile(workspace, JSON.stringify({ folders: [] }));
async function installAndLaunch(vsix, expected) {
  const install = spawnSync(cli, [...cliArgs, ...profileArgs, '--install-extension', resolve(vsix), '--force'], { encoding: 'utf8' });
  process.stdout.write(install.stdout || ''); process.stderr.write(install.stderr || '');
  if (install.status !== 0) { throw new Error('Isolated VSIX install failed'); }
  await runTests({ vscodeExecutablePath: executable,
    extensionDevelopmentPath: resolve('tests/fixtures/install-probe'),
    extensionTestsPath: resolve('tests/fixtures/install-probe/run.cjs'),
    extensionTestsEnv: { SIMPLEECODE_EXPECT_VERSION: expected },
    launchArgs: [workspace, ...profileArgs, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-updates', '--disable-telemetry'],
  });
}
if (baseline) { await installAndLaunch(baseline, '0.1.0'); }
await installAndLaunch(candidate, '0.2.0');
console.log('PASS: installed artifact activation and settings survival. This is not an HTTPS updater test. Profile:', root);
