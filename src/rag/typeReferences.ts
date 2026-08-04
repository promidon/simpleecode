/**
 * Deterministic type-reference extraction (Build Order #9, Swift slice). PURE.
 *
 * Swift imports name modules (`import SwiftUI`), not file paths — so relative-
 * import resolution finds nothing for Swift. This is the Swift-friendly edge:
 * the capitalized identifiers a piece of code USES (`SinglyViewModel`,
 * `ReminderActions`) can be matched against the top-level declarations other
 * indexed files EXPOSE. No LLM, no similarity search — exact name lookup.
 */

/** Keywords and universal names that look like types but never identify a file. */
const NOISE = new Set([
  // Swift keywords / literals that are capitalized-ish contexts
  'Self', 'Any', 'AnyObject', 'Type', 'Protocol', 'True', 'False',
  // ubiquitous standard-library / SDK roots that would match half a project
  'String', 'Int', 'Double', 'Float', 'Bool', 'Array', 'Set', 'Dictionary',
  'Optional', 'Error', 'Result', 'Data', 'Date', 'URL', 'UUID',
  // TS/JS globals
  'Promise', 'Map', 'Object', 'Number', 'Boolean', 'JSON', 'Math', 'Buffer',
  'Record', 'Partial', 'Readonly', 'Pick', 'Omit',
]);

const DECLARATION_RE =
  /\b(?:class|struct|enum|protocol|actor|extension|interface|typealias|type|func|function)\s+([A-Z][A-Za-z0-9_]*)/g;

const IDENTIFIER_RE = /\b[A-Z][A-Za-z0-9_]+\b/g;

/**
 * Capitalized identifiers referenced (not declared) in `code`, most frequent
 * first, capped at `max`. Deterministic: same code → same list.
 */
export function referencedTypeNames(code: string, max = 12): string[] {
  const declared = new Set<string>();
  for (const m of code.matchAll(DECLARATION_RE)) {
    declared.add(m[1]);
  }

  const counts = new Map<string, number>();
  for (const m of code.matchAll(IDENTIFIER_RE)) {
    const name = m[0];
    if (declared.has(name) || NOISE.has(name)) {
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([name]) => name);
}
