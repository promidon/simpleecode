/**
 * Update check logic. PURE — no `vscode`, no network — so the decision
 * ("is there an update?") is unit-tested and deterministic. The I/O wrapper
 * (`UpdateChecker.ts`) only loads the manifest and shows the notification.
 */

/** Compare two semver-ish versions: -1 (a < b), 0 (equal), 1 (a > b). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function parts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isFinite(n));
}

/** The `version` field of a package.json text, if parseable. */
export function versionFromManifest(jsonText: string): string | undefined {
  try {
    const value = JSON.parse(jsonText) as { version?: unknown };
    return typeof value.version === 'string' && /\d/.test(value.version)
      ? value.version
      : undefined;
  } catch {
    return undefined;
  }
}

interface ManifestAsset {
  /** https URL to the prebuilt .vsix, when the manifest is a latest.json. */
  url?: string;
  /** Short release notes to show in the update prompt. */
  notes?: string;
  /** SHA-256 of the VSIX bytes. Required before automatic installation. */
  sha256?: string;
}

/**
 * Pull the download URL + notes from a `latest.json`
 * (`{ version, url, notes }`). A plain package.json has neither, so this
 * returns an empty object and the caller falls back to a manual update.
 */
export function assetFromManifest(jsonText: string | undefined): ManifestAsset {
  if (!jsonText) {
    return {};
  }
  try {
    const v = JSON.parse(jsonText) as {
      url?: unknown;
      vsixUrl?: unknown;
      notes?: unknown;
      sha256?: unknown;
    };
    const raw = typeof v.url === 'string' ? v.url : v.vsixUrl;
    const url = typeof raw === 'string' && /^https:\/\//.test(raw) ? raw : undefined;
    const notes = typeof v.notes === 'string' ? v.notes.slice(0, 2_000) : undefined;
    const sha256 =
      typeof v.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(v.sha256)
        ? v.sha256.toLowerCase()
        : undefined;
    return { url, notes, sha256 };
  } catch {
    return {};
  }
}

/** Automatic assets must be HTTPS and stay on the configured feed's origin. */
export function isTrustedUpdateAsset(source: string, assetUrl: string): boolean {
  try {
    const feed = new URL(source);
    const asset = new URL(assetUrl);
    return (
      feed.protocol === 'https:' &&
      asset.protocol === 'https:' &&
      feed.origin === asset.origin
    );
  } catch {
    return false;
  }
}

interface UpdateDecision {
  updateAvailable: boolean;
  latest?: string;
  current: string;
}

/** Decide from raw inputs. Unparseable manifests mean "no update" (fail soft). */
export function decideUpdate(
  currentVersion: string,
  manifestText: string | undefined,
): UpdateDecision {
  const latest = manifestText ? versionFromManifest(manifestText) : undefined;
  if (!latest) {
    return { updateAvailable: false, current: currentVersion };
  }
  return {
    updateAvailable: compareVersions(latest, currentVersion) > 0,
    latest,
    current: currentVersion,
  };
}
