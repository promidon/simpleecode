/**
 * Facts Layer floor. PURE (no `vscode`) so it is unit-testable.
 *
 * Reads a declaration straight from the source text — kind, name, signature — so
 * facts work on ANY project, with no language server. This is what makes the
 * facts truly project-agnostic: SourceKit-LSP is blind to a bare Xcode target,
 * but this reads the text directly. The LSP, when present, *enriches* on top.
 *
 * Swift + Python first (the project's focus). Other languages return `undefined`
 * and fall back to the language server (which serves them well).
 */
interface Declaration {
  kind: string;
  name: string;
  signature: string;
}

const SWIFT_DECL =
  /\b(enum|struct|class|protocol|actor|extension|func|var|let)\s+([A-Za-z_]\w*)/;
const PYTHON_DECL = /\b(async\s+def|def|class)\s+([A-Za-z_]\w*)/;

export function parseDeclaration(
  text: string,
  languageId: string,
): Declaration | undefined {
  if (languageId === 'swift') {
    return parseSwift(text);
  }
  if (languageId === 'python') {
    return parsePython(text);
  }
  return undefined;
}

function parseSwift(text: string): Declaration | undefined {
  const m = SWIFT_DECL.exec(text);
  if (!m) {
    return undefined;
  }
  const from = m.index;
  const brace = text.indexOf('{', from);
  const end = brace >= 0 ? brace : text.length;
  return { kind: m[1], name: m[2], signature: collapse(text.slice(from, end)) };
}

function parsePython(text: string): Declaration | undefined {
  const m = PYTHON_DECL.exec(text);
  if (!m) {
    return undefined;
  }
  const from = m.index;
  const newline = text.indexOf('\n', from);
  const end = newline >= 0 ? newline : text.length;
  const signature = collapse(text.slice(from, end)).replace(/:\s*$/, '');
  const kind = m[1].includes('def') ? 'function' : 'class';
  return { kind, name: m[2], signature };
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
