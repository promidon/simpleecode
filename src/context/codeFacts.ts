import * as vscode from 'vscode';
import { parseHover } from './hoverParse';
import { explainSignature } from './explainSignature';
import { keywordDefinition } from './keywordGlossary';
import { parseDeclaration } from './parseDeclaration';
import type { SourceSnapshot } from '../explanation/model';
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

export async function getCodeFacts(source: SourceSnapshot, allowLsp = true, allowExternalFacts = true): Promise<CodeFacts | undefined> {
  const selected = source.focus === 'selection' ? source.selectedText : source.fullText;
  const declared = parseDeclaration(selected, source.languageId);
  const identifier = declared?.name ?? selected.match(/\b[A-Za-z_]\w*/g)?.find(word => !/^(return|function|const|let|var|if|else|class|import|export|default|async|await|new|throw|try|true|false|null|undefined)$/.test(word));
  if (!identifier) { return undefined; }
  const selectionOffset = source.focus === 'file' ? 0 : source.fullText.split('\n').slice(0, source.startLine - 1).reduce((n, line) => n + line.length + 1, 0) + source.startCharacter;
  const offset = source.fullText.indexOf(identifier, selectionOffset);
  const prefix = source.fullText.slice(0, Math.max(0, offset)).split('\n');
  const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === source.uri);
  let lsp: LspFacts | undefined;
  if (allowLsp && document?.version === source.version && offset >= 0) {
    lsp = await readLspFacts(document.uri, new vscode.Position(prefix.length - 1, prefix.at(-1)!.length));
    if (document.version !== source.version) { lsp = undefined; }
    if (!allowExternalFacts && lsp?.definition?.replace(/:\d+$/, '') !== vscode.workspace.asRelativePath(document.uri, false)) { lsp = undefined; }
  }
  const signature = lsp?.signature ?? declared?.signature;
  return {
    symbol: identifier, kind: declared?.kind,
    kindMeaning: declared?.kind ? keywordDefinition(declared.kind, source.languageId) : undefined,
    signature, plain: signature ? explainSignature(signature) : undefined,
    doc: lsp?.doc, definition: lsp?.definition, callerCount: lsp?.callerCount,
    structure: structureFacts(selected, source.languageId),
  };
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
