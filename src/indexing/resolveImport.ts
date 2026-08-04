import { dirname, resolve } from 'path';

/**
 * Resolve a RELATIVE import specifier (`./x`, `../y`) from a file to a real,
 * indexed file path. PURE — the caller supplies `has` (usually the file
 * index). Non-relative specifiers (modules like `vscode`, `SwiftUI`) return
 * undefined: they name packages, not files.
 */
const RESOLVE_EXTS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.swift', '.json',
];

export function resolveRelativeImport(
  fromFile: string,
  specifier: string,
  has: (path: string) => boolean,
): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...RESOLVE_EXTS.map((e) => base + e),
    ...RESOLVE_EXTS.map((e) => resolve(base, `index${e}`)),
  ];
  return candidates.find(has);
}
