import { resolveRelativeImport } from './resolveImport';

/**
 * Build Order #19. The graph layer: file-to-file edges computed
 * deterministically from the index — no LSP, no LLM. PURE.
 *
 * - `imports`    — a relative import resolves to the target file (TS/JS).
 * - `references` — the file uses a type the target declares (Swift-friendly;
 *                  `via` carries the matched name).
 * - `tests`      — the file is a test of the target, by naming convention
 *                  (`foo.test.ts` → `foo.ts`, `FooTests.swift` → `Foo.swift`).
 *
 * Edges are derived data: rebuilt from file records on every index pass, so
 * they can never go stale independently of the files they describe.
 */
type EdgeType = 'imports' | 'references' | 'tests';

interface EdgeRecord {
  id: string; // "<fromId>-><toId>:<type>" — stable
  fromId: string;
  toId: string;
  type: EdgeType;
  /** For `references`: the declared name that links the files. */
  via?: string;
}

export interface GraphFileInput {
  id: string; // absolute path
  path: string; // workspace-relative
  imports: string[];
  exports: string[];
  references: string[];
}

const TEST_SUFFIX_RE = /^(.*?)(?:[._-](?:test|spec)|Tests?)$/;

export function buildEdges(files: GraphFileInput[]): EdgeRecord[] {
  const byId = new Map(files.map((f) => [f.id, f]));
  const has = (path: string) => byId.has(path);
  const edges = new Map<string, EdgeRecord>();
  const linked = new Set<string>(); // "<fromId>-><toId>" pairs already edged

  const add = (fromId: string, toId: string, type: EdgeType, via?: string) => {
    if (fromId === toId) {
      return;
    }
    const pair = `${fromId}->${toId}`;
    if (linked.has(pair)) {
      return;
    }
    linked.add(pair);
    const id = `${pair}:${type}`;
    edges.set(id, { id, fromId, toId, type, via });
  };

  // 1. tests — naming convention beats everything else for the pair.
  const byStem = new Map<string, GraphFileInput[]>();
  for (const file of files) {
    const stem = stemOf(file.path);
    const list = byStem.get(stem) ?? [];
    list.push(file);
    byStem.set(stem, list);
  }
  for (const file of files) {
    const testedStem = testTargetStem(file.path);
    if (!testedStem) {
      continue;
    }
    for (const target of byStem.get(testedStem) ?? []) {
      add(file.id, target.id, 'tests');
    }
  }

  // 2. imports — exact relative-import resolution.
  for (const file of files) {
    for (const spec of file.imports) {
      const resolved = resolveRelativeImport(file.id, spec, has);
      if (resolved) {
        add(file.id, resolved, 'imports');
      }
    }
  }

  // 3. references — used name ∩ declared name (first declaring file by path).
  const declaring = new Map<string, GraphFileInput>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const name of file.exports) {
      if (!declaring.has(name)) {
        declaring.set(name, file);
      }
    }
  }
  for (const file of files) {
    for (const name of file.references) {
      const target = declaring.get(name);
      if (target) {
        add(file.id, target.id, 'references', name);
      }
    }
  }

  return [...edges.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Edges pointing AT a file (its dependents / its tests). */
export function edgesTo(edges: EdgeRecord[], id: string): EdgeRecord[] {
  return edges.filter((e) => e.toId === id);
}

/** Edges leaving a file (what it depends on / what it tests). */
export function edgesFrom(edges: EdgeRecord[], id: string): EdgeRecord[] {
  return edges.filter((e) => e.fromId === id);
}

/** "src/foo.test.ts" → "foo" when the name marks a test, else undefined. */
function testTargetStem(path: string): string | undefined {
  const match = stemOf(path).match(TEST_SUFFIX_RE);
  return match ? match[1] : undefined;
}

/** Basename minus the LAST extension: "src/foo.test.ts" → "foo.test". */
function stemOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? base : base.slice(0, dot);
}
