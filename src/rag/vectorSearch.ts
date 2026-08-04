/**
 * Build Order #17. Local vector search over code chunks. PURE.
 *
 * The vectors are SPARSE term vectors (TF-IDF) compared by cosine similarity —
 * not dense embeddings. Deliberate: no model download, no native dependency,
 * and fully deterministic (same index + same query → same ranking), which is
 * the SimpleeCode rule. A dense-embedding backend can replace `SparseVectorIndex`
 * behind the same shape later without callers changing.
 *
 * Chunking is by code structure, as the build todo demands: one chunk per
 * indexed symbol (declaration preview) plus one per file summary.
 */
export interface Chunk {
  id: string;
  fileId: string;
  /** Workspace-relative path for display. */
  path: string;
  /** "12-31" line range for symbol chunks. */
  range?: string;
  kind: 'symbol' | 'file_summary';
  /** Text used for matching. */
  text: string;
  /** Text worth sending as context when this chunk is retrieved. */
  content: string;
}

interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

/** Words too common in code to carry meaning. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'it', 'and', 'or', 'for', 'this',
  'that', 'what', 'how', 'does', 'do', 'my', 'me', 'why', 'where', 'when',
  'func', 'function', 'let', 'var', 'const', 'return', 'import', 'export',
  'class', 'struct', 'enum', 'interface', 'type', 'public', 'private',
  'static', 'async', 'await', 'true', 'false', 'nil', 'null', 'undefined',
  'void', 'new', 'self', 'else',
]);

/**
 * Split code/prose into lowercase terms. CamelCase and snake_case identifiers
 * contribute their parts AND the whole word, so "viewmodel" finds
 * `SinglyViewModel` and "captureListId" finds itself.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[^A-Za-z0-9]+/)) {
    if (!raw) {
      continue;
    }
    const parts = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(' ');
    const whole = raw.toLowerCase();
    for (const term of parts.length > 1 ? [...parts, whole] : [whole]) {
      if (term.length >= 2 && !STOPWORDS.has(term) && !/^\d+$/.test(term)) {
        out.push(term);
        const stem = lightStem(term);
        if (stem !== term) {
          out.push(stem);
        }
      }
    }
  }
  return out;
}

/**
 * Tiny deterministic stemmer so a prose question meets code identifiers:
 * "reminders" → "reminder", "saved"/"saves" → "save", "loading" → "load".
 * Applied to corpus AND query, so both sides normalize the same way.
 */
function lightStem(term: string): string {
  if (term.length > 5 && term.endsWith('ing')) {
    return term.slice(0, -3);
  }
  if (term.length > 3 && term.endsWith('ed')) {
    return term.slice(0, -1); // saved → save
  }
  if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) {
    return term.slice(0, -1);
  }
  return term;
}

export class SparseVectorIndex {
  private readonly vectors: Array<{ chunk: Chunk; weights: Map<string, number>; norm: number }> = [];
  private readonly idf = new Map<string, number>();

  constructor(chunks: Chunk[]) {
    // Document frequency per term.
    const df = new Map<string, number>();
    const termCounts = chunks.map((chunk) => {
      const counts = new Map<string, number>();
      for (const term of tokenize(chunk.text)) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
      for (const term of counts.keys()) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
      return counts;
    });

    const n = chunks.length;
    for (const [term, count] of df) {
      this.idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
    }

    chunks.forEach((chunk, i) => {
      const weights = new Map<string, number>();
      let sq = 0;
      for (const [term, count] of termCounts[i]) {
        const w = (1 + Math.log(count)) * this.idf.get(term)!;
        weights.set(term, w);
        sq += w * w;
      }
      this.vectors.push({ chunk, weights, norm: Math.sqrt(sq) });
    });
  }

  /** Top-k chunks by cosine similarity. Deterministic: score, then id. */
  search(query: string, k = 5): ScoredChunk[] {
    const queryCounts = new Map<string, number>();
    for (const term of tokenize(query)) {
      queryCounts.set(term, (queryCounts.get(term) ?? 0) + 1);
    }
    const queryWeights = new Map<string, number>();
    let sq = 0;
    for (const [term, count] of queryCounts) {
      const idf = this.idf.get(term);
      if (idf === undefined) {
        continue; // term appears nowhere in the corpus
      }
      const w = (1 + Math.log(count)) * idf;
      queryWeights.set(term, w);
      sq += w * w;
    }
    const queryNorm = Math.sqrt(sq);
    if (queryNorm === 0) {
      return [];
    }

    const scored: ScoredChunk[] = [];
    for (const { chunk, weights, norm } of this.vectors) {
      if (norm === 0) {
        continue;
      }
      let dot = 0;
      for (const [term, w] of queryWeights) {
        const cw = weights.get(term);
        if (cw !== undefined) {
          dot += w * cw;
        }
      }
      if (dot > 0) {
        scored.push({ chunk, score: dot / (norm * queryNorm) });
      }
    }
    return scored
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, k);
  }
}

// --- chunk building ----------------------------------------------------------

interface ChunkFileInput {
  id: string;
  path: string;
  summary?: string;
}

interface ChunkSymbolInput {
  id: string;
  fileId: string;
  name: string;
  kind: string;
  range: { startLine: number; endLine: number };
  signature?: string;
  codePreview: string;
}

/** Structure-based chunks: one per symbol, one per file summary. PURE. */
export function buildChunks(
  files: ChunkFileInput[],
  symbols: ChunkSymbolInput[],
): Chunk[] {
  const pathById = new Map(files.map((f) => [f.id, f.path]));
  const chunks: Chunk[] = [];

  for (const file of files) {
    if (file.summary) {
      chunks.push({
        id: `${file.id}#summary`,
        fileId: file.id,
        path: file.path,
        kind: 'file_summary',
        text: `${file.path} ${file.summary}`,
        content: file.summary,
      });
    }
  }
  for (const sym of symbols) {
    chunks.push({
      id: sym.id,
      fileId: sym.fileId,
      path: pathById.get(sym.fileId) ?? sym.fileId,
      range: `${sym.range.startLine}-${sym.range.endLine}`,
      kind: 'symbol',
      text: `${sym.name} ${sym.kind} ${sym.signature ?? ''} ${sym.codePreview}`,
      content: sym.codePreview,
    });
  }
  return chunks;
}
