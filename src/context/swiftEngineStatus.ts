/**
 * Detects whether the Swift language server (the "engine") can serve this
 * workspace — and, if not, the exact command to fix it. PURE (no `vscode`) so it
 * is unit-testable; the caller passes in what's at the workspace root.
 *
 * Accuracy first: facts are only as exact as the engine's build info. An SPM
 * package or a project with `buildServer.json` is served accurately; a bare
 * Xcode project needs `xcode-build-server` to generate that build info.
 */
type EngineStatus = 'spm' | 'xcode-ready' | 'xcode-needs-setup' | 'unknown';

interface EngineInfo {
  status: EngineStatus;
  message: string;
  /** The `xcode-build-server` command to run, when setup is needed. */
  setupCommand?: string;
}

interface EngineInputs {
  hasPackageSwift: boolean;
  hasBuildServerJson: boolean;
  xcodeProject?: string; // e.g. "here.xcodeproj"
  xcodeWorkspace?: string; // e.g. "here.xcworkspace"
  scheme?: string; // confirmed by the user; falls back to the target's base name
}

export function swiftEngineStatus(input: EngineInputs): EngineInfo {
  if (input.hasBuildServerJson) {
    return {
      status: 'xcode-ready',
      message:
        'Swift engine is configured (buildServer.json found). Symbol facts are served accurately.',
    };
  }
  if (input.hasPackageSwift) {
    return {
      status: 'spm',
      message:
        'Swift Package (Package.swift) — the Swift engine works out of the box.',
    };
  }
  const target = input.xcodeWorkspace ?? input.xcodeProject;
  if (target) {
    const scheme = input.scheme ?? schemeFromTarget(target);
    return {
      status: 'xcode-needs-setup',
      message:
        'This is a bare Xcode project. The Swift engine needs a build server for accurate facts (types, callers, SDK symbols).',
      setupCommand: buildSetupCommand(input, scheme),
    };
  }
  return { status: 'unknown', message: 'No Swift project detected at the workspace root.' };
}

function buildSetupCommand(input: EngineInputs, scheme: string): string {
  const targetFlag = input.xcodeWorkspace
    ? `-workspace ${quote(input.xcodeWorkspace)}`
    : `-project ${quote(input.xcodeProject ?? '')}`;
  return `xcode-build-server config ${targetFlag} -scheme ${quote(scheme)}`;
}

function schemeFromTarget(target: string): string {
  return target.replace(/\.(xcodeproj|xcworkspace)$/, '');
}

function quote(s: string): string {
  return /\s/.test(s) ? `'${s}'` : s;
}
