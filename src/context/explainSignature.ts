/**
 * Build Order: Facts Layer, Slice 4 (the "documentation generator" part).
 * PURE (no `vscode`) so it is unit-testable.
 *
 * Turns a verified signature into one plain sentence: what it takes, what it
 * gives back. Deterministic — it reads the signature's shape, it does not guess.
 * Degrades to `undefined` when it can't parse, so callers just show nothing.
 */
interface FunctionSignature {
  params: Array<{ name: string; type: string }>;
  returns?: string;
}

export function explainSignature(signature: string): string | undefined {
  const fn = parseFunctionSignature(signature);
  if (fn) {
    const takes = fn.params.length
      ? `Takes ${fn.params.map((p) => `${p.name} (${p.type})`).join(', ')}`
      : 'Takes no inputs';
    const gives = isNothing(fn.returns)
      ? 'gives back nothing'
      : `gives back ${fn.returns}`;
    return `${takes}; ${gives}.`;
  }

  const type = parsePropertyType(signature);
  return type ? `A value of type ${type}.` : undefined;
}

function parseFunctionSignature(sig: string): FunctionSignature | undefined {
  const open = sig.indexOf('(');
  if (open < 0) {
    return undefined;
  }
  const close = matchingParen(sig, open);
  if (close < 0) {
    return undefined;
  }
  const after = sig.slice(close + 1).trim();
  const isFunction = /\bfunc\b/.test(sig) || /=>/.test(sig) || /->/.test(after) || after.startsWith(':');
  if (!isFunction) {
    return undefined; // parens but no return marker — likely a property initializer
  }

  const inner = sig.slice(open + 1, close).trim();
  const params = inner
    ? splitTopLevel(inner).map(parseParam).filter((p): p is { name: string; type: string } => p !== undefined)
    : [];
  return { params, returns: parseReturn(after) };
}

function parseReturn(after: string): string | undefined {
  const m =
    after.match(/->\s*(.+)$/) ?? after.match(/=>\s*(.+)$/) ?? after.match(/^:\s*(.+)$/);
  if (!m) {
    return undefined;
  }
  const type = m[1].replace(/\s*\{.*$/, '').trim();
  return type || undefined;
}

function parseParam(raw: string): { name: string; type: string } | undefined {
  const colon = raw.indexOf(':');
  if (colon < 0) {
    return undefined;
  }
  const left = raw.slice(0, colon).trim();
  const type = raw.slice(colon + 1).trim();
  const name = left.split(/\s+/).pop() ?? left; // last word before the colon
  return name && type ? { name, type } : undefined;
}

function matchingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') {
      depth++;
    } else if (s[i] === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Split on top-level commas only (ignore commas inside <>, (), []). */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '(' || c === '[') {
      depth++;
    } else if ((c === '>' && s[i - 1] !== '-' && s[i - 1] !== '=') || c === ')' || c === ']') {
      depth--;
    } else if (c === ',' && depth === 0) {
      parts.push(s.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(s.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parsePropertyType(sig: string): string | undefined {
  // Read the type after `:`, stopping at an initializer (`=`) or end of line.
  const m = sig.match(/:\s*([^={]+?)\s*(?:=|$)/);
  return m ? m[1].trim() : undefined;
}

function isNothing(returns?: string): boolean {
  if (!returns) {
    return true;
  }
  const t = returns.replace(/[()]/g, '').trim().toLowerCase();
  return t === '' || t === 'void' || t === 'never';
}
