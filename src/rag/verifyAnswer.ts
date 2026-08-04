/**
 * Build Order #20. The citation checker — a "hallucination linter".
 *
 * PURE (no `vscode` import) so it is unit-testable. Given an explanation and the
 * ground truth we actually sent (code, parent symbol, line range) plus the index
 * (known files + symbols), it finds every file / symbol / line the answer
 * references and marks each one grounded or unverified.
 *
 * This is deliberately a limited claim checker, not a proof of the whole answer.
 * Anything it does not recognize remains unchecked and the UI must say so.
 */
export interface AnswerGroundTruth {
  sentFilePath?: string;
  /** The code text that was actually sent (selection and/or full file). */
  sentCode: string;
  sentSymbol?: string;
  sentStartLine?: number;
  sentEndLine?: number;
  /** Workspace-relative paths known to the file index. */
  knownFiles: string[];
  /** Exported / declared symbol names known to the index. */
  knownSymbols: string[];
  /** Verified facts about the focal symbol (Facts Layer) — extra ground truth. */
  facts?: {
    symbol: string;
    signature?: string;
    definition?: string; // "path:line"
  };
  /** Authoritative doc text we actually have (e.g. the editor's hover docs). */
  docText?: string;
}

type ClaimKind = 'file' | 'symbol' | 'line' | 'fact' | 'doc';
type ClaimStatus = 'grounded' | 'unverified';

interface VerifiedClaim {
  kind: ClaimKind;
  text: string;
  status: ClaimStatus;
  note: string;
  /**
   * Where to open to check this claim in one click (notes #2, click-through).
   * Set for grounded file references and in-range line references. `path` is a
   * workspace-relative or absolute path; `line` is 1-based when known.
   */
  location?: { path: string; line?: number };
}

export interface VerifyResult {
  claims: VerifiedClaim[];
  grounded: number;
  unverified: number;
  coverage: 'none' | 'partial';
  note: string;
}

const FILE_RE =
  /[\w./-]*\w\.(?:ts|tsx|js|jsx|mjs|cjs|swift|json|md|css|scss|html|py|go|rs|java|rb)\b/gi;
const FILE_EXT_RE =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|swift|json|md|css|scss|html|py|go|rs|java|rb)$/i;
const CODE_SPAN_RE = /`([^`\n]+)`/g;
const LINE_RE = /\blines?\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?/gi;
const IDENT_RE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\(\))?$/;

export function verifyAnswer(
  answer: string,
  truth: AnswerGroundTruth,
): VerifyResult {
  const claims: VerifiedClaim[] = [];
  const seen = new Set<string>();

  // The verified facts are extra ground truth: the focal symbol, the types from
  // its signature, and its definition file all count as "known".
  const verifiedTypes = typesFromSignature(truth.facts?.signature);
  const focal = truth.facts?.symbol;
  const defFile = truth.facts?.definition?.split(':')[0];
  const ground: AnswerGroundTruth = {
    ...truth,
    knownSymbols: [
      ...truth.knownSymbols,
      ...verifiedTypes,
      ...(focal ? [focal] : []),
    ],
    knownFiles: [...truth.knownFiles, ...(defFile ? [defFile] : [])],
  };

  // --- file references ---
  for (const m of answer.matchAll(FILE_RE)) {
    const ref = m[0];
    const key = `file:${ref.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const resolvedPath = resolveFile(ref, ground);
    claims.push({
      kind: 'file',
      text: ref,
      status: resolvedPath ? 'grounded' : 'unverified',
      note: resolvedPath
        ? 'Matches a file in your index.'
        : 'No such file in your index — possibly invented.',
      location: resolvedPath ? { path: resolvedPath } : undefined,
    });
  }

  // --- backticked code identifiers (e.g. `send()`, `SinglyViewModel`) ---
  for (const m of answer.matchAll(CODE_SPAN_RE)) {
    const span = m[1].trim();
    if (!IDENT_RE.test(span) || FILE_EXT_RE.test(span)) {
      continue; // skip code lines, prose, and file names (handled above)
    }
    const key = `symbol:${span.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const grounded = symbolIsKnown(span, ground);
    claims.push({
      kind: 'symbol',
      text: span,
      status: grounded ? 'grounded' : 'unverified',
      note: grounded
        ? 'Appears in the sent code or your index.'
        : 'Not in the sent code or your index — check it.',
    });
  }

  // --- line references ---
  if (truth.sentStartLine !== undefined && truth.sentEndLine !== undefined) {
    for (const m of answer.matchAll(LINE_RE)) {
      const start = Number.parseInt(m[1], 10);
      const end = m[2] ? Number.parseInt(m[2], 10) : start;
      const ref = m[0].trim();
      const key = `line:${ref.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const grounded = rangeIsContained(
        start,
        end,
        truth.sentStartLine,
        truth.sentEndLine,
      );
      claims.push({
        kind: 'line',
        text: ref,
        status: grounded ? 'grounded' : 'unverified',
        note: grounded
          ? 'Within the lines that were sent.'
          : `Outside the sent range (${truth.sentStartLine}-${truth.sentEndLine}).`,
        location:
          grounded && truth.sentFilePath
            ? { path: truth.sentFilePath, line: start }
            : undefined,
      });
    }
  }

  // --- fact contradiction: did the answer claim a different type than the LSP? ---
  const contradiction = typeContradiction(answer, focal, verifiedTypes);
  if (contradiction) {
    claims.push(contradiction);
  }

  // --- documentation claims: "according to the docs..." must be backed by text ---
  const docClaim = documentationClaim(answer, truth.docText);
  if (docClaim) {
    claims.push(docClaim);
  }

  const grounded = claims.filter((c) => c.status === 'grounded').length;
  const unverified = claims.length - grounded;
  return {
    claims,
    grounded,
    unverified,
    coverage: claims.length === 0 ? 'none' : 'partial',
    note:
      claims.length === 0
        ? 'No checkable file, symbol, line, type, or documentation claims were detected. The prose remains unchecked.'
        : 'Limited check only: unrecognized prose and behavior claims remain unchecked.',
  };
}

const PRIMITIVE_TYPES = new Set([
  'string', 'number', 'boolean', 'int', 'bool', 'double', 'float',
  'void', 'any', 'char', 'long', 'short', 'object', 'array',
]);

/** Type identifiers declared in a signature (after `:` or `->`). */
function typesFromSignature(signature?: string): string[] {
  if (!signature) {
    return [];
  }
  const types = new Set<string>();
  for (const m of signature.matchAll(/(?::|->)\s*([A-Za-z_][\w.<>,?[\] ]*)/g)) {
    for (const token of m[1].match(/[A-Za-z_]\w*/g) ?? []) {
      types.add(token);
    }
  }
  return [...types];
}

/** Flag when the answer asserts the focal symbol is a different type than verified. */
function typeContradiction(
  answer: string,
  focal: string | undefined,
  verifiedTypes: string[],
): VerifiedClaim | undefined {
  if (!focal || verifiedTypes.length === 0) {
    return undefined;
  }
  const re = new RegExp(
    `\`?\\b${escapeRegExp(focal)}\\b\`?\\s+(?:is|are)\\s+(?:an?|the)?\\s*\`?([A-Za-z_]\\w*)\`?`,
    'i',
  );
  const claimed = re.exec(answer)?.[1];
  if (!claimed || !looksLikeType(claimed)) {
    return undefined;
  }
  if (verifiedTypes.some((t) => t.toLowerCase() === claimed.toLowerCase())) {
    return undefined;
  }
  return {
    kind: 'fact',
    text: `${focal} is ${claimed}`,
    status: 'unverified',
    note: `Contradicts the verified type (${verifiedTypes.join(', ')}).`,
  };
}

function looksLikeType(token: string): boolean {
  return /^[A-Z]/.test(token) || PRIMITIVE_TYPES.has(token.toLowerCase());
}

const SOURCE_CLAIM_RE =
  /\b(?:according to (?:the )?(?:docs?|documentation|apple)|(?:the )?(?:official )?docs?\s+says?|the documentation\s+says?|as documented|per the (?:docs?|documentation))\b/i;

/**
 * When the answer cites "the docs", it's only trustworthy if we actually had doc
 * text. With text → grounded; without → flagged so the user opens the real link.
 */
function documentationClaim(
  answer: string,
  docText: string | undefined,
): VerifiedClaim | undefined {
  if (!SOURCE_CLAIM_RE.test(answer)) {
    return undefined;
  }
  const sentence = answer
    .split(/(?<=[.!?])\s+/)
    .find((part) => SOURCE_CLAIM_RE.test(part)) ?? answer;
  const claimTokens = meaningfulTokens(sentence);
  const docTokens = new Set(meaningfulTokens(docText ?? ''));
  const overlap = claimTokens.filter((token) => docTokens.has(token)).length;
  const hasSupport = Boolean(docText?.trim()) && overlap >= Math.min(2, claimTokens.length);
  return {
    kind: 'doc',
    text: 'cites documentation',
    status: hasSupport ? 'grounded' : 'unverified',
    note: hasSupport
      ? 'The cited claim shares specific terms with doc text in context.'
      : 'The available doc text does not directly support this claim — open the doc link to check.',
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The openable path for a file reference, or undefined if it's not in the index. */
function resolveFile(
  ref: string,
  truth: AnswerGroundTruth,
): string | undefined {
  const refBase = basename(ref).toLowerCase();
  if (
    truth.sentFilePath &&
    basename(truth.sentFilePath).toLowerCase() === refBase
  ) {
    return truth.sentFilePath;
  }
  const lower = ref.toLowerCase();
  const matches = truth.knownFiles.filter((f) => {
    const fl = f.toLowerCase();
    return fl === lower || fl.endsWith(`/${lower}`) || basename(fl) === refBase;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function symbolIsKnown(span: string, truth: AnswerGroundTruth): boolean {
  const bare = span.replace(/\(\)$/, ''); // send() -> send
  const base = bare.split('.')[0]; // filter.capturesNote -> filter
  if (PRIMITIVE_TYPES.has(bare.toLowerCase())) {
    return true; // language built-ins are always valid
  }
  if (containsIdentifier(truth.sentCode, bare) || containsIdentifier(truth.sentCode, base)) {
    return true;
  }
  if (truth.sentSymbol === bare || truth.sentSymbol === base) {
    return true;
  }
  return truth.knownSymbols.includes(bare) || truth.knownSymbols.includes(base);
}

function rangeIsContained(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 <= a2 && a1 >= b1 && a2 <= b2;
}

function containsIdentifier(code: string, identifier: string): boolean {
  return new RegExp(`\\b${escapeRegExp(identifier)}\\b`).test(code);
}

const DOC_STOP_WORDS = new Set([
  'according', 'documentation', 'official', 'docs', 'doc', 'says', 'said',
  'this', 'that', 'with', 'from', 'have', 'will', 'apple',
]);

function meaningfulTokens(text: string): string[] {
  return [
    ...new Set(
      (text.toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) ?? []).filter(
        (token) => !DOC_STOP_WORDS.has(token),
      ),
    ),
  ];
}

function basename(p: string): string {
  const n = p.replace(/\\/g, '/');
  return n.slice(n.lastIndexOf('/') + 1);
}
