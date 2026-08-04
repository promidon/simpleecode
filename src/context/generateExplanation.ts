import { parseDeclaration } from './parseDeclaration';
import { explainSignature } from './explainSignature';
import { constructNotes } from './constructNotes';
import { enclosingTypePath } from './enclosingType';
import {
  explainDeclarationLine,
  keywordDefinition,
  syntaxDefinition,
} from './keywordGlossary';

/**
 * A DETERMINISTIC explanation — written by SimpleeCode, not the AI.
 *
 * This is the "documentation generator": it reads the code's own structure and
 * its `///` doc comments and composes a readable explanation. No language
 * server, no LLM, no guessing. Swift `///` docs are used verbatim (the author's
 * own words); members without a doc get a plain reading of their signature.
 *
 * PURE (no `vscode`) so it is unit-testable.
 */
interface OutlineItem {
  kind: string;
  name: string;
  signature: string;
  doc?: string;
}

const MAX_ITEMS = 40;

export function generateExplanation(
  text: string,
  languageId: string,
  fileLabel: string,
): string | undefined {
  const items = outline(text, languageId);
  if (items.length === 0) {
    return undefined;
  }
  return render(items, fileLabel);
}

/**
 * Explain whatever the user selected. A single identifier (e.g. `orbState`) is
 * looked up to its declaration in the file and explained on its own. Anything
 * larger falls back to outlining the declarations inside the selection.
 */
export function explainSelection(
  selectedText: string,
  fileText: string,
  languageId: string,
  fileLabel: string,
): string | undefined {
  const trimmed = selectedText.trim();

  // An exact operator/sigil/macro token: `??`, `as?`, `->`, `$0`, `#Preview`.
  const token = syntaxDefinition(trimmed, languageId);
  if (token) {
    return `${trimmed}\n\n${token}`;
  }

  // Import detection only for a single line (not a big block that starts with one).
  if (!trimmed.includes('\n')) {
    const asImport = explainImport(trimmed, languageId);
    if (asImport) {
      return asImport;
    }
  }
  // A single word: a language keyword answers from the glossary (fixed truth —
  // `struct` means the same thing in every file); otherwise look up the
  // identifier's in-file declaration. Returns undefined when it isn't declared
  // here, so the caller can ask the language server instead.
  if (/^[A-Za-z_]\w*$/.test(trimmed)) {
    const keyword = keywordDefinition(trimmed, languageId);
    if (keyword) {
      return `${trimmed} (keyword)\n\n${keyword}`;
    }
    return explainSymbolInFile(trimmed, fileText, languageId);
  }

  // Control-flow lines are statements, not declarations — teach the statement
  // and the constructs it uses (`guard let` is a binding + early exit, not a
  // stored property).
  const firstWord = trimmed.match(/^[a-z]\w*/)?.[0];
  const isStatement = firstWord !== undefined && STATEMENT_KEYWORDS.has(firstWord);

  // A selected declaration teaches its own anatomy: attributes, modifiers,
  // keyword, name, conformances — and why this kind (struct vs class) when a
  // known contract decides it. Larger selections get the outline below it.
  const anatomy = isStatement
    ? undefined
    : explainDeclarationLine(trimmed, languageId);
  const notes = constructNotes(trimmed, languageId);

  if (anatomy) {
    let result = anatomy;

    // Nested type (book: Nested Types): when the file shows this declaration
    // living inside another type, teach the full name and why nesting exists.
    const decl = parseDeclaration(trimmed, languageId);
    const at = fileText.indexOf(trimmed);
    if (decl && at >= 0) {
      const containers = enclosingTypePath(fileText, at);
      if (containers.length) {
        const outer = containers.join('.');
        result += `\n• Nested type: this lives inside ${outer}, so its full name is ${outer}.${decl.name}. Nesting keeps a helper type scoped to the type that uses it.`;
      }
    }

    if (notes.length) {
      result += `\n\nAlso used here:\n${notes.map((n) => `• ${n}`).join('\n')}`;
    }
    const items = outline(selectedText, languageId);
    if (items.length > 1) {
      const body = generateExplanation(selectedText, languageId, fileLabel);
      return body ? `${result}\n\nInside it:\n\n${body}` : result;
    }
    return result;
  }

  // A statement or expression: lead with the statement keyword's meaning,
  // then every construct the line uses.
  if (notes.length || (isStatement && keywordDefinition(firstWord, languageId))) {
    const bullets: string[] = [];
    const lead = isStatement ? keywordDefinition(firstWord, languageId) : undefined;
    if (lead && !notes.some((n) => n.startsWith(firstWord!))) {
      bullets.push(`• ${firstWord} — ${lead}`);
    }
    bullets.push(...notes.map((n) => `• ${n}`));
    const headline = trimmed.split('\n')[0];
    return `${headline}\n\n${bullets.join('\n')}`;
  }

  return generateExplanation(selectedText, languageId, fileLabel);
}

/** Lines starting with these are statements to teach, not declarations. */
const STATEMENT_KEYWORDS = new Set([
  'guard', 'if', 'else', 'for', 'while', 'repeat', 'switch', 'return',
  'do', 'defer', 'throw', 'break', 'continue', 'case', 'try', 'await',
]);

function explainSymbolInFile(
  name: string,
  fileText: string,
  languageId: string,
): string | undefined {
  const found = outline(fileText, languageId).find((it) => it.name === name);
  if (!found) {
    return undefined;
  }
  const detail = found.doc ?? explainSignature(found.signature);
  const head = `${found.name} (${found.kind})`;
  return detail ? `${head}\n\n${detail}` : `${head}\n\nDeclared in this file.`;
}

/** Explain an `import` line straight from the text — no language server needed. */
function explainImport(trimmed: string, languageId: string): string | undefined {
  if (languageId === 'swift') {
    const m =
      /^import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z_][\w.]*)/.exec(
        trimmed,
      );
    if (m) {
      return `import ${m[1]}\n\nMakes the ${m[1]} module/framework available in this file — its types and APIs can be used here.`;
    }
  }
  if (languageId === 'python') {
    const from = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(trimmed);
    if (from) {
      return `from ${from[1]} import ${from[2]}\n\nBrings ${from[2].trim()} from the ${from[1]} module into this file.`;
    }
    const imp = /^import\s+([\w.]+)/.exec(trimmed);
    if (imp) {
      return `import ${imp[1]}\n\nMakes the ${imp[1]} module available in this file.`;
    }
  }
  return undefined;
}

function outline(text: string, languageId: string): OutlineItem[] {
  if (languageId !== 'swift' && languageId !== 'python') {
    return [];
  }
  const items: OutlineItem[] = [];
  let doc: string[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();

    if (languageId === 'swift' && line.startsWith('///')) {
      doc.push(line.replace(/^\/\/\/\s?/, ''));
      continue;
    }
    if (line === '') {
      doc = [];
      continue;
    }
    // Compiler directive (#if) or an ordinary comment: skip. A plain `//` comment
    // resets the doc buffer so it isn't mis-attached to the next declaration.
    if (line.startsWith('#') || (line.startsWith('//') && !line.startsWith('///'))) {
      if (line.startsWith('//')) {
        doc = [];
      }
      continue;
    }

    const decl = parseDeclaration(raw, languageId);
    if (decl) {
      items.push({ ...decl, doc: doc.join(' ').trim() || undefined });
      if (items.length >= MAX_ITEMS) {
        break;
      }
    }
    doc = [];
  }
  return items;
}

function render(items: OutlineItem[], fileLabel: string): string {
  const header = `${fileLabel} — ${items.length} declaration${items.length === 1 ? '' : 's'}.`;
  const blocks = items.map((it) => {
    const detail = it.doc ?? explainSignature(it.signature);
    const head = `• ${it.name} (${it.kind})`;
    return detail ? `${head}\n   ${detail}` : head;
  });
  return `${header}\n\n${blocks.join('\n')}`;
}
