/**
 * Build Order #16. One-sentence file summaries, computed deterministically
 * from what the index already knows — language, declarations, imports. PURE,
 * no LLM: the summary can't lie about the file, and regeneration is free, so
 * hash-based caching falls out of the incremental indexer (unchanged files
 * keep their record, changed files get a fresh summary).
 *
 * Raw code stays the source of truth — summaries ride along as orientation.
 */
const MAX_NAMES = 5;

interface SummarizeInput {
  language: string;
  imports: string[];
  exports: string[];
}

export function summarizeModule(input: SummarizeInput): string {
  const parts: string[] = [`${labelForLanguage(input.language)} file.`];
  if (input.exports.length) {
    parts.push(`Declares ${nameList(input.exports)}.`);
  }
  const modules = input.imports.filter((i) => !i.startsWith('.'));
  const locals = input.imports.length - modules.length;
  if (modules.length) {
    parts.push(`Uses ${nameList(modules)}.`);
  }
  if (locals > 0) {
    parts.push(`Imports ${locals} local file(s).`);
  }
  return parts.join(' ');
}

function nameList(names: string[]): string {
  const shown = names.slice(0, MAX_NAMES);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(', ')} (+${more} more)` : shown.join(', ');
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  typescriptreact: 'TypeScript React',
  javascript: 'JavaScript',
  javascriptreact: 'JavaScript React',
  swift: 'Swift',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  ruby: 'Ruby',
  json: 'JSON',
  markdown: 'Markdown',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
};

function labelForLanguage(language: string): string {
  return LANGUAGE_LABELS[language] ?? (language || 'Plain');
}
