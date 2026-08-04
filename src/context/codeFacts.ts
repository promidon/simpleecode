import * as vscode from 'vscode';
import { parseHover } from './hoverParse';
import { explainSignature } from './explainSignature';
import { keywordDefinition } from './keywordGlossary';
import { parseDeclaration } from './parseDeclaration';
import { getParentSymbol } from './parentSymbol';
import { structureFacts, type StructureFacts } from './structureFacts';

/**
 * Build Order: Facts Layer, Slice 1. Deterministic facts about the symbol under
 * the cursor, asked straight from the language server (the engine behind hover
 * tooltips): its type/signature, doc comment, where it's defined, and how many
 * places use it. No LLM, no guessing.
 *
 * Returns `undefined` when there's no editor or no symbol at the cursor. Each
 * lookup is best-effort: a missing provider yields a missing field, never a throw.
 */
export interface CodeFacts {
  symbol: string;
  /** Declaration kind from the source text (enum/func/class/var…). */
  kind?: string;
  /** What that kind MEANS, from the keyword glossary (fixed truth). */
  kindMeaning?: string;
  signature?: string;
  /** Plain-language reading of the signature ("Takes x (Int); gives back Bool."). */
  plain?: string;
  doc?: string;
  /** Workspace-relative "path:line" of the definition. */
  definition?: string;
  /** How many references the language server found. */
  callerCount?: number;
  /** Statement-level facts read from the source itself (no LSP needed). */
  structure?: StructureFacts;
}

export async function getCodeFacts(): Promise<CodeFacts | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  // Floor: parse the selected text ourselves — works with no language server.
  const selected = editor.document.getText(editor.selection);
  const declared = parseDeclaration(selected, editor.document.languageId);

  // Enrich: ask the language server, when it actually serves this file.
  const probe = await probePosition(editor);
  const lsp = probe
    ? await readLspFacts(editor.document.uri, probe.position)
    : undefined;

  const symbol = declared?.name ?? probe?.symbol;
  if (!symbol) {
    return undefined;
  }
  const signature = lsp?.signature ?? declared?.signature;
  const plain = signature ? explainSignature(signature) : undefined;
  return {
    symbol,
    kind: declared?.kind,
    kindMeaning: declared?.kind
      ? keywordDefinition(declared.kind, editor.document.languageId)
      : undefined,
    signature,
    plain,
    doc: lsp?.doc,
    definition: lsp?.definition,
    callerCount: lsp?.callerCount,
    // Structure facts come from the selected text itself — always available,
    // even when no language server serves the file.
    structure: structureFacts(selected, editor.document.languageId),
  };
}

/**
 * Explain the symbol under the cursor using the language server (the "engine") —
 * for things not declared in this file (frameworks, SDK types like `SwiftUI`,
 * `View`, `URL`). Deterministic: same code + position → same hover. Returns
 * undefined when the server has nothing (e.g. an unindexed Xcode target).
 */
export async function explainSymbolViaLsp(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const probe = await probePosition(editor);
  if (!probe) {
    return undefined;
  }
  const hover = await readHover(editor.document.uri, probe.position);
  const { signature, doc } = parseHover(hover);
  if (!signature && !doc) {
    return undefined;
  }
  const lines = [probe.symbol];
  if (signature) {
    lines.push('', explainSignature(signature) ?? signature);
  }
  if (doc) {
    lines.push('', doc);
  }
  return lines.join('\n');
}

interface LspFacts {
  signature?: string;
  doc?: string;
  definition?: string;
  callerCount?: number;
}

async function readLspFacts(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<LspFacts> {
  const [hover, definition, callerCount] = await Promise.all([
    readHover(uri, position),
    readDefinition(uri, position),
    countReferences(uri, position),
  ]);
  const { signature, doc } = parseHover(hover);
  return { signature, doc, definition, callerCount };
}

/**
 * Where to read facts from: the word under the cursor if there is one, otherwise
 * the enclosing symbol's name (so a selection that starts on an attribute line
 * like `@MainActor` still resolves to the type/function it belongs to).
 */
async function probePosition(
  editor: vscode.TextEditor,
): Promise<{ position: vscode.Position; symbol: string } | undefined> {
  // 1. The word under the cursor — but skip language keywords like `enum`/`func`.
  for (const candidate of [editor.selection.active, editor.selection.start]) {
    const range = editor.document.getWordRangeAtPosition(candidate);
    if (range) {
      const word = editor.document.getText(range);
      if (!DECLARATION_KEYWORDS.has(word)) {
        return { position: range.start, symbol: word };
      }
    }
  }
  // 2. First non-keyword identifier in the selection (e.g. the name after `enum`).
  const scanned = firstIdentifierInSelection(editor);
  if (scanned) {
    return scanned;
  }
  // 3. The enclosing symbol's name.
  const parent = await getParentSymbol();
  if (parent) {
    return {
      position: new vscode.Position(
        parent.namePosition.line,
        parent.namePosition.character,
      ),
      symbol: parent.name,
    };
  }
  return undefined;
}

const DECLARATION_KEYWORDS = new Set([
  'enum', 'struct', 'class', 'func', 'var', 'let', 'protocol', 'actor',
  'extension', 'typealias', 'case', 'import', 'static', 'final', 'public',
  'private', 'internal', 'open', 'fileprivate', 'override', 'init', 'return',
]);

function firstIdentifierInSelection(
  editor: vscode.TextEditor,
): { position: vscode.Position; symbol: string } | undefined {
  const sel = editor.selection;
  for (let line = sel.start.line; line <= sel.end.line; line++) {
    const text = editor.document.lineAt(line).text;
    const re = /[A-Za-z_]\w*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const ch = m.index;
      if (line === sel.start.line && ch < sel.start.character) {
        continue;
      }
      if (line === sel.end.line && ch >= sel.end.character) {
        break;
      }
      if (!DECLARATION_KEYWORDS.has(m[0])) {
        return { position: new vscode.Position(line, ch), symbol: m[0] };
      }
    }
  }
  return undefined;
}

async function readHover(uri: vscode.Uri, position: vscode.Position): Promise<string> {
  try {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      uri,
      position,
    );
    if (!hovers?.length) {
      return '';
    }
    return hovers
      .flatMap((h) => h.contents.map(hoverPartToText))
      .join('\n')
      .trim();
  } catch {
    return '';
  }
}

function hoverPartToText(part: vscode.MarkdownString | vscode.MarkedString): string {
  if (typeof part === 'string') {
    return part;
  }
  return part.value;
}

async function readDefinition(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<string | undefined> {
  try {
    const defs = await vscode.commands.executeCommand<
      (vscode.Location | vscode.LocationLink)[]
    >('vscode.executeDefinitionProvider', uri, position);
    const first = defs?.[0];
    if (!first) {
      return undefined;
    }
    const target =
      'targetUri' in first
        ? { uri: first.targetUri, range: first.targetRange }
        : first;
    const rel = vscode.workspace.asRelativePath(target.uri, false);
    return `${rel}:${target.range.start.line + 1}`;
  } catch {
    return undefined;
  }
}

async function countReferences(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<number | undefined> {
  try {
    const refs = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri,
      position,
    );
    return refs?.length;
  } catch {
    return undefined;
  }
}
