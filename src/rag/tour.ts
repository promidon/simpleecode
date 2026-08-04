import { buildEdges, type GraphFileInput } from '../indexing/graphEdges';

/**
 * Build Order P1 #4 — Codebase Tour planner.
 *
 * The reverse of the normal flow: instead of the user finding code and asking
 * about it, the tool leads a file-by-file walk in dependency order. PURE (no
 * `vscode`) so it is unit-testable — it plans the stops deterministically from
 * the file index + graph edges (#19); the extension opens each file and can run
 * a grounded explain on it.
 *
 * Order: entry points first (files nothing imports — "start here"), richest
 * overview leading, then the load-bearing core by how many files depend on it.
 * Tests and non-code files are skipped so the walk stays about the code.
 */
export interface TourFile extends GraphFileInput {
  language: string;
  /** Deterministic one-sentence summary (#16), when indexed. */
  summary?: string;
}

export interface TourStop {
  id: string; // absolute path (to open the file)
  path: string; // workspace-relative (display)
  language: string;
  summary?: string;
  /** Why this file sits at this point in the tour. */
  reason: string;
  /** How many indexed files depend on it. */
  dependents: number;
  /** How many local files it depends on. */
  localDeps: number;
}

interface TourPlan {
  stops: TourStop[];
  /** How many code files were candidates (stops may be capped below this). */
  total: number;
}

const MAX_STOPS = 15;
const NON_CODE = new Set(['json', 'markdown', 'css', 'scss', 'html']);

export function planTour(files: TourFile[]): TourPlan {
  const candidates = files.filter(
    (f) => !NON_CODE.has(f.language) && !isTestPath(f.path),
  );

  const edges = buildEdges(candidates);
  const dependents = new Map<string, number>();
  const localDeps = new Map<string, number>();
  for (const f of candidates) {
    dependents.set(f.id, 0);
    localDeps.set(f.id, 0);
  }
  for (const e of edges) {
    if (e.type === 'tests') {
      continue; // a test depending on a file isn't "the codebase depends on it"
    }
    dependents.set(e.toId, (dependents.get(e.toId) ?? 0) + 1);
    if (e.type === 'imports') {
      localDeps.set(e.fromId, (localDeps.get(e.fromId) ?? 0) + 1);
    }
  }

  const ranked = [...candidates].sort((a, b) => {
    const da = dependents.get(a.id) ?? 0;
    const db = dependents.get(b.id) ?? 0;
    const aEntry = da === 0;
    const bEntry = db === 0;
    if (aEntry !== bEntry) {
      return aEntry ? -1 : 1; // entry points lead
    }
    if (aEntry) {
      // among entry points, the one pulling in the most files maps best.
      const la = localDeps.get(a.id) ?? 0;
      const lb = localDeps.get(b.id) ?? 0;
      if (la !== lb) {
        return lb - la;
      }
      return a.path.localeCompare(b.path);
    }
    // the rest: most load-bearing first.
    if (da !== db) {
      return db - da;
    }
    return a.path.localeCompare(b.path);
  });

  const stops = ranked.slice(0, MAX_STOPS).map((f): TourStop => {
    const dep = dependents.get(f.id) ?? 0;
    const ld = localDeps.get(f.id) ?? 0;
    return {
      id: f.id,
      path: f.path,
      language: f.language,
      summary: f.summary,
      dependents: dep,
      localDeps: ld,
      reason: reasonFor(dep, ld),
    };
  });

  return { stops, total: candidates.length };
}

function reasonFor(dependents: number, localDeps: number): string {
  if (dependents > 0) {
    return `Load-bearing — ${dependents} file${dependents === 1 ? '' : 's'} depend on this.`;
  }
  if (localDeps > 0) {
    return `Start here — nothing imports this file, and it pulls in ${localDeps} local file${localDeps === 1 ? '' : 's'}, so it maps the codebase.`;
  }
  return 'Start here — nothing imports this file, so it is an entry point.';
}

function isTestPath(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return (
    /[._-](test|spec)\./i.test(base) ||
    /Tests?\.[a-z]+$/i.test(base) ||
    /(^|\/)tests?\//i.test(path)
  );
}
