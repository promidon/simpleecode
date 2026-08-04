import * as vscode from 'vscode';

/**
 * The function/class/symbol that encloses the current selection (Build Order
 * #7/#8, focused slice). This is DETERMINISTIC: it asks VS Code's built-in
 * document-symbol provider (the language server — SourceKit-LSP for Swift,
 * tsserver for TS, etc.) for the file's symbol tree, then returns the innermost
 * symbol whose range contains the cursor. Same file + position → same result.
 *
 * Returns `undefined` when there is no editor, or when no symbol provider is
 * available / nothing encloses the cursor. That "no result" is deterministic
 * too — never a guess.
 */
interface ParentSymbol {
  name: string;
  kind: string; // human-readable SymbolKind, e.g. "function"
  startLine: number; // 1-based
  endLine: number; // 1-based
  /** 0-based position of the symbol's name — a good spot to hover for facts. */
  namePosition: { line: number; character: number };
}

export async function getParentSymbol(): Promise<ParentSymbol | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const result = await vscode.commands.executeCommand<
    vscode.DocumentSymbol[] | vscode.SymbolInformation[]
  >('vscode.executeDocumentSymbolProvider', editor.document.uri);

  if (!Array.isArray(result) || result.length === 0) {
    return undefined;
  }

  // Probe the selection END first, then its START. The end resolves correctly
  // even when the selection begins on an attribute line (e.g. `@MainActor`) that
  // sits just above the symbol's own range; the start is the fallback for
  // selections that run past the bottom of a symbol. Providers return
  // DocumentSymbol[] (a tree) or the older flat SymbolInformation[] — handle both.
  const { start, end } = editor.selection;
  const probe = (p: vscode.Position): ParentSymbol | undefined =>
    isDocumentSymbolArray(result)
      ? findInnermostDocumentSymbol(result, p)
      : findSmallestEnclosing(result, p);

  return probe(end) ?? probe(start);
}

function isDocumentSymbolArray(
  symbols: vscode.DocumentSymbol[] | vscode.SymbolInformation[],
): symbols is vscode.DocumentSymbol[] {
  return (symbols[0] as vscode.DocumentSymbol).range !== undefined;
}

function findInnermostDocumentSymbol(
  symbols: vscode.DocumentSymbol[],
  pos: vscode.Position,
): ParentSymbol | undefined {
  for (const sym of symbols) {
    if (sym.range.contains(pos)) {
      // Prefer the most specific (deepest) symbol that still contains pos.
      const deeper = findInnermostDocumentSymbol(sym.children ?? [], pos);
      return deeper ?? toParentSymbol(sym.name, sym.kind, sym.range, sym.selectionRange.start);
    }
  }
  return undefined;
}

function findSmallestEnclosing(
  symbols: vscode.SymbolInformation[],
  pos: vscode.Position,
): ParentSymbol | undefined {
  let best: vscode.SymbolInformation | undefined;
  for (const sym of symbols) {
    if (!sym.location.range.contains(pos)) {
      continue;
    }
    if (!best || rangeLineSpan(sym.location.range) < rangeLineSpan(best.location.range)) {
      best = sym;
    }
  }
  return best
    ? toParentSymbol(best.name, best.kind, best.location.range, best.location.range.start)
    : undefined;
}

function rangeLineSpan(range: vscode.Range): number {
  return range.end.line - range.start.line;
}

function toParentSymbol(
  name: string,
  kind: vscode.SymbolKind,
  range: vscode.Range,
  namePos: vscode.Position,
): ParentSymbol {
  return {
    name,
    kind: vscode.SymbolKind[kind]?.toLowerCase() ?? 'symbol',
    startLine: range.start.line + 1,
    endLine: range.end.line + 1,
    namePosition: { line: namePos.line, character: namePos.character },
  };
}
