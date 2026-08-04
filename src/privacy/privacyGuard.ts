import type { PrivacyScope } from '../context/ContextPacket';

/**
 * Pure privacy logic — deliberately free of any `vscode` import so it can be
 * unit-tested in plain Node. The editor-facing reader lives in
 * `PrivacySettings.ts` and feeds a plain `PrivacyConfig` in here.
 */

export interface PrivacyConfig {
  defaultScope: PrivacyScope;
  showPromptBeforeSending: boolean;
  maxFileBytes: number;
  redactSecrets: boolean;
  blockedFileGlobs: string[];
}

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  defaultScope: 'current_file',
  showPromptBeforeSending: true,
  maxFileBytes: 200_000,
  redactSecrets: true,
  blockedFileGlobs: [
    '**/.env',
    '**/.env.*',
    '**/*.pem',
    '**/*.key',
    '**/*.p12',
    '**/*.pfx',
    '**/id_rsa',
    '**/id_dsa',
    '**/secrets/**',
    '**/*.secret',
    '**/*credentials*',
  ],
};

interface GuardResult {
  /** When true, nothing may be sent for this file. `reason` explains why. */
  blocked: boolean;
  reason?: string;
  /** The text that is safe to send (possibly redacted / truncated). */
  text: string;
  truncated: boolean;
  /** Human-readable notes about what was changed, surfaced in the preview. */
  redactions: string[];
}

const TRUNCATION_MARKER =
  '\n\n/* … SimpleeCode truncated the rest of this file (size guard) … */\n';

/**
 * Apply path blocking, size truncation and secret redaction to a chunk of code.
 * `filePath` may be undefined for untitled buffers (path checks are skipped).
 */
export function applyGuards(
  filePath: string | undefined,
  text: string,
  config: PrivacyConfig,
): GuardResult {
  if (filePath && isPathBlocked(filePath, config.blockedFileGlobs)) {
    return {
      blocked: true,
      reason: `"${basename(filePath)}" matches a blocked-file rule and is never sent to Claude.`,
      text: '',
      truncated: false,
      redactions: [],
    };
  }

  const redactions: string[] = [];
  let working = text;

  if (config.redactSecrets) {
    const result = redactSecrets(working);
    working = result.text;
    if (result.count > 0) {
      redactions.push(
        `Redacted ${result.count} line(s) that look like secrets (keys / tokens / passwords).`,
      );
    }
  }

  let truncated = false;
  if (byteLength(working) > config.maxFileBytes) {
    working = truncateToBytes(working, config.maxFileBytes) + TRUNCATION_MARKER;
    truncated = true;
    redactions.push(
      `Truncated content to the first ${config.maxFileBytes} bytes (size guard).`,
    );
  }

  return { blocked: false, text: working, truncated, redactions };
}

/** Glob match against a POSIX-normalized path. Supports `*`, `**`, `?`. */
export function isPathBlocked(filePath: string, globs: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return globs.some((glob) => globToRegExp(glob).test(normalized));
}

/**
 * Redact values on lines whose key looks sensitive, plus standalone high-signal
 * token shapes (provider keys, PEM blocks). Conservative by design: it errs
 * toward leaving code intact while catching the obvious leaks.
 */
export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  const placeholder = '«redacted by SimpleeCode»';
  let inPrivateKeyBlock = false;

  const lines = text.split('\n').map((line) => {
    // Redact complete PEM/OpenSSH private-key blocks. Removing only the BEGIN
    // line would leave the actual key body behind.
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(line)) {
      inPrivateKeyBlock = true;
      count++;
      return placeholder;
    }
    if (inPrivateKeyBlock) {
      count++;
      if (/-----END [A-Z0-9 ]*PRIVATE KEY-----/.test(line)) {
        inPrivateKeyBlock = false;
      }
      return placeholder;
    }

    // <secret-named identifier> = value  /  : value  — anywhere on the line, so
    // it catches `const apiKey = "…"`, `OPENAI_API_KEY=…`, `password: "…"`, etc.
    // The lazy prefix keeps any leading `const`/`let`/`this.` and the operator,
    // redacting only the value. Over-redaction (e.g. `tokenizer`) is the safe
    // failure mode for a privacy guard.
    const kv = line.match(
      /^(.*?\b[\w.$-]*(?:api[_-]?key|secret|passwd|password|private[_-]?key|client[_-]?secret|access[_-]?(?:key|token)|auth[_-]?token|bearer|token)[\w.$-]*\s*[:=]\s*)(\S.*)$/i,
    );
    if (kv && kv[2].trim().length > 0) {
      count++;
      return `${kv[1]}${placeholder}`;
    }

    // Standalone provider token shapes anywhere in the line.
    if (
      /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/.test(
        line,
      )
    ) {
      count++;
      return line.replace(
        /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/g,
        placeholder,
      );
    }

    return line;
  });

  return { text: lines.join('\n'), count };
}

// --- helpers ---------------------------------------------------------------

function globToRegExp(glob: string): RegExp {
  // Build a regex piecewise so `**`, `*` and `?` get distinct semantics and all
  // other regex metacharacters are escaped.
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` => any depth (including across `/`)
        re += '.*';
        i++;
        if (glob[i + 1] === '/') {
          i++; // consume the slash so `**/x` also matches a bare `x`
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`(^|/)${re}$`);
}

function basename(p: string): string {
  const norm = p.replace(/\\/g, '/');
  return norm.slice(norm.lastIndexOf('/') + 1);
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

function truncateToBytes(s: string, maxBytes: number): string {
  if (byteLength(s) <= maxBytes) {
    return s;
  }
  // Buffer slice can split a multi-byte char; decode tolerantly then trim.
  const sliced = Buffer.from(s, 'utf8').subarray(0, maxBytes).toString('utf8');
  return sliced.replace(/�+$/, '');
}
