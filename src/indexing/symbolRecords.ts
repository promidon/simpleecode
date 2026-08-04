/**
 * Build Order #7. Turn a document-symbol tree (what the language server knows
 * about a file) into flat, storable `SymbolRecord`s. PURE — no `vscode` import;
 * the caller passes plain data, so this is unit-testable with fake trees.
 *
 * Deterministic: same tree + same source lines → same records.
 */
type SymbolRecordKind =
  | 'function'
  | 'class'
  | 'component'
  | 'hook'
  | 'type'
  | 'constant';

export interface SymbolRecord {
  /** `<fileId>#<container path>` — stable within a file, e.g. "/a.ts#Store.load". */
  id: string;
  fileId: string;
  name: string;
  kind: SymbolRecordKind;
  range: { startLine: number; endLine: number }; // 1-based, inclusive
  /** First declaration line, trimmed (a cheap signature). */
  signature?: string;
  /** The first lines of the symbol's own code. */
  codePreview: string;
}

/** Plain shape of `vscode.DocumentSymbol` (kind is the numeric SymbolKind). */
export interface DocSymbolLike {
  name: string;
  kind: number;
  startLine: number; // 0-based
  endLine: number; // 0-based
  children?: DocSymbolLike[];
}

/** `vscode.SymbolKind` numeric values → SimpleeCode kinds. Unlisted kinds are skipped. */
const KIND_MAP: Record<number, SymbolRecordKind> = {
  4: 'class', // Class
  5: 'function', // Method
  8: 'function', // Constructor
  11: 'function', // Function
  9: 'type', // Enum
  10: 'type', // Interface
  22: 'type', // Struct
  6: 'constant', // Property
  7: 'constant', // Field
  12: 'constant', // Variable
  13: 'constant', // Constant
  21: 'constant', // EnumMember
};

const MAX_SYMBOLS_PER_FILE = 200;
const MAX_PREVIEW_LINES = 20;
const MAX_PREVIEW_CHARS = 800;
const MAX_SIGNATURE_CHARS = 160;

export function toSymbolRecords(
  symbols: DocSymbolLike[],
  fileId: string,
  lines: string[],
  languageId: string,
): SymbolRecord[] {
  const out: SymbolRecord[] = [];
  walk(symbols, [], fileId, lines, languageId, out);
  return out;
}

function walk(
  symbols: DocSymbolLike[],
  containers: string[],
  fileId: string,
  lines: string[],
  languageId: string,
  out: SymbolRecord[],
): void {
  for (const sym of symbols) {
    if (out.length >= MAX_SYMBOLS_PER_FILE) {
      return;
    }
    const path = [...containers, sym.name];
    const kind = KIND_MAP[sym.kind];
    if (kind) {
      const signature = lines[sym.startLine]?.trim().slice(0, MAX_SIGNATURE_CHARS);
      out.push({
        id: `${fileId}#${path.join('.')}`,
        fileId,
        name: sym.name,
        kind: refineKind(kind, sym.name, languageId),
        range: { startLine: sym.startLine + 1, endLine: sym.endLine + 1 },
        signature: signature || undefined,
        codePreview: preview(lines, sym.startLine, sym.endLine),
      });
    }
    walk(sym.children ?? [], path, fileId, lines, languageId, out);
  }
}

/** React-flavored refinement: hooks and components, by convention (TS/JS only). */
function refineKind(
  kind: SymbolRecordKind,
  name: string,
  languageId: string,
): SymbolRecordKind {
  if (kind !== 'function' || !/^(java|type)script/.test(languageId)) {
    return kind;
  }
  if (/^use[A-Z]/.test(name)) {
    return 'hook';
  }
  if (/react/.test(languageId) && /^[A-Z]/.test(name)) {
    return 'component';
  }
  return kind;
}

function preview(lines: string[], startLine: number, endLine: number): string {
  const slice = lines.slice(startLine, Math.min(endLine + 1, startLine + MAX_PREVIEW_LINES));
  const text = slice.join('\n');
  return text.length <= MAX_PREVIEW_CHARS
    ? text
    : `${text.slice(0, MAX_PREVIEW_CHARS)}\n… (truncated)`;
}

/**
 * Pick the best declaration for a referenced name: types and classes beat
 * constants (a `let view: View` property shouldn't shadow the `View` type),
 * then stable path order. PURE — used by the index's lookup.
 */
export function pickDeclaration(
  candidates: SymbolRecord[],
): SymbolRecord | undefined {
  const priority: Record<SymbolRecordKind, number> = {
    type: 0,
    class: 1,
    component: 2,
    function: 3,
    hook: 4,
    constant: 5,
  };
  return [...candidates].sort(
    (a, b) => priority[a.kind] - priority[b.kind] || a.id.localeCompare(b.id),
  )[0];
}
