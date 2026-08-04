/**
 * Facts Layer, Slice 3 (structure): statement-level facts read straight from
 * the source text. PURE — no `vscode`, no language server, no LLM. Works on any
 * project with zero setup (including a bare Xcode target), which is the point:
 * the facts floor must never depend on a build server being configured.
 *
 * A lightweight scanner, not a full parser (Tree-sitter can replace it later).
 * Conservative by design: it under-counts rather than guesses.
 */
interface DeclaredVariable {
  name: string;
  /** let / var / const */
  kind: string;
  /** Declared type annotation, when written in the source. */
  type?: string;
}

export interface StructureFacts {
  variables: DeclaredVariable[];
  /** Function/method names this code calls. */
  calls: string[];
  loops: number;
  branches: number;
  returns: number;
}

const MAX_LIST = 12;

const CALL_KEYWORDS = new Set([
  // control flow / declarations that look like calls
  'if', 'for', 'while', 'switch', 'catch', 'repeat', 'guard', 'return',
  'func', 'init', 'subscript', 'deinit', 'throw', 'throws', 'await', 'try',
  'function', 'constructor', 'super', 'typeof', 'new', 'do', 'else', 'case',
]);

export function structureFacts(
  code: string,
  languageId: string,
): StructureFacts | undefined {
  const clean = stripCommentsAndStrings(code);
  if (!clean.trim()) {
    return undefined;
  }

  const variables = findVariables(clean, languageId);
  const calls = findCalls(clean);
  const loops = count(clean, /\b(?:for|while|repeat)\b/g);
  const branches = count(clean, /\b(?:if|guard|switch)\b/g);
  const returns = count(clean, /\breturn\b/g);

  if (!variables.length && !calls.length && !loops && !branches && !returns) {
    return undefined;
  }
  return { variables, calls, loops, branches, returns };
}

function findVariables(code: string, languageId: string): DeclaredVariable[] {
  const keyword =
    languageId === 'swift' ? '(let|var)' : '(const|let|var)';
  const re = new RegExp(
    `\\b${keyword}\\s+([A-Za-z_]\\w*)(?:\\s*:\\s*([A-Za-z_][\\w.<>\\[\\], ?!]*?))?\\s*(?=[=\\n;{)]|$)`,
    'gm',
  );
  const out: DeclaredVariable[] = [];
  const seen = new Set<string>();
  for (const m of code.matchAll(re)) {
    const name = m[2];
    if (seen.has(name) || out.length >= MAX_LIST) {
      continue;
    }
    seen.add(name);
    out.push({ name, kind: m[1], type: m[3]?.trim() || undefined });
  }
  return out;
}

function findCalls(code: string): string[] {
  // A declaration is not a call: drop `func name(` / `function name(`.
  const withoutDecls = code.replace(
    /\b(?:func|function)\s+[A-Za-z_]\w*\s*\(/g,
    '',
  );
  const counts = new Map<string, number>();
  for (const m of withoutDecls.matchAll(/([A-Za-z_]\w*)\s*\(/g)) {
    const name = m[1];
    if (CALL_KEYWORDS.has(name)) {
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LIST)
    .map(([name]) => name);
}

function count(code: string, re: RegExp): number {
  return [...code.matchAll(re)].length;
}

/**
 * Remove comments and string bodies so a `for` inside a string or comment is
 * not counted as a loop. Line-based and tolerant — good enough for facts.
 */
export function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* block comments */
    .replace(/\/\/[^\n]*/g, ' ') // // line comments
    .replace(/#[^\n]*/g, ' ') // # python-style comments
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""') // "strings" (keep quotes)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''") // 'strings'
    .replace(/`(?:\\.|[^`\\])*`/g, '``'); // `template strings`
}
