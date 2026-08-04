/**
 * Build Order #7 (slice). Deterministic, regex-based extraction of a file's
 * import specifiers and exported names. PURE (no `vscode` import) so it is
 * unit-testable and cheap to run during indexing.
 *
 * It is a lightweight scanner, not a full parser. It covers TS/JS and Swift well
 * enough to drive v1 deterministic retrieval (#9): "what does this file import,
 * and what does it expose?". Tree-sitter can replace it later (#22).
 */
import { referencedTypeNames } from '../rag/typeReferences';

interface ModuleGraph {
  /** Import specifiers, e.g. "./foo", "../bar", "vscode", "Foundation". */
  imports: string[];
  /** Exported / top-level declared names, e.g. "buildPrompt", "FileIndex". */
  exports: string[];
  /**
   * Type-like names the file USES (not declares). Drives Swift dependent
   * lookup: a file referencing `SinglyViewModel` depends on the file that
   * declares it, even though Swift has no path imports.
   */
  references: string[];
}

export function parseModuleGraph(text: string, languageId: string): ModuleGraph {
  const graph = languageId === 'swift' ? parseSwift(text) : parseTsJs(text);
  return { ...graph, references: referencedTypeNames(text, 50) };
}

function parseTsJs(text: string): Omit<ModuleGraph, 'references'> {
  const imports = new Set<string>();
  const exports = new Set<string>();

  // import ... from '...'   |   export ... from '...'
  for (const m of text.matchAll(/(?:import|export)\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
    imports.add(m[1]);
  }
  // side-effect import '...'
  for (const m of text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    imports.add(m[1]);
  }
  // require('...')  and dynamic import('...')
  for (const m of text.matchAll(/\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    imports.add(m[1]);
  }

  // export const|let|var|function|class|interface|type|enum NAME
  for (const m of text.matchAll(
    /\bexport\s+(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g,
  )) {
    exports.add(m[1]);
  }
  // export default ...
  if (/\bexport\s+default\b/.test(text)) {
    exports.add('default');
  }
  // export { a, b as c }
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) {
        exports.add(name);
      }
    }
  }

  return { imports: [...imports], exports: [...exports] };
}

function parseSwift(text: string): Omit<ModuleGraph, 'references'> {
  const imports = new Set<string>();
  const exports = new Set<string>();

  // import Foundation  |  import struct Foo.Bar (optional kind keyword)
  for (const m of text.matchAll(
    /^\s*import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z0-9_.]+)/gm,
  )) {
    imports.add(m[1]);
  }
  // Swift has no explicit exports; treat top-level declarations as the surface.
  for (const m of text.matchAll(
    /\b(?:func|class|struct|enum|protocol|actor|extension)\s+([A-Za-z0-9_]+)/g,
  )) {
    exports.add(m[1]);
  }

  return { imports: [...imports], exports: [...exports] };
}
