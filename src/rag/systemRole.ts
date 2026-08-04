import { buildEdges, edgesFrom, edgesTo } from '../indexing/graphEdges';

/**
 * "Explain System Role" grounding (Build Order #20, deterministic slice). PURE.
 *
 * From the graph layer (#19) alone, work out where a file sits in the module
 * graph: what it imports, what it exposes, which files DEPEND on it, and which
 * files TEST it. Edges come from exact, no-LLM signals — relative-import
 * resolution (TS/JS), reference ∩ exports (Swift), and test naming conventions.
 */
export interface IndexedFile {
  id: string; // absolute path
  path: string; // workspace-relative (display)
  language: string;
  imports: string[];
  exports: string[];
  references: string[];
  /** Deterministic one-sentence summary (#16), when indexed. */
  summary?: string;
}

interface SystemRoleSummary {
  path: string;
  language: string;
  /** Deterministic file summary (#16), when available. */
  summary?: string;
  /** Names this file exposes to the rest of the codebase. */
  exports: string[];
  /** External modules/frameworks it imports (vscode, SwiftUI, …). */
  moduleImports: string[];
  /** Local files it depends on (resolved relative imports). */
  dependsOn: string[];
  /** Local files that depend on it, with the exact reason. */
  dependents: Array<{ path: string; why: string }>;
  /** Test files that cover it, by naming convention (#19). */
  testedBy: string[];
}

const MAX_LIST = 12;

export function describeSystemRole(
  focalId: string,
  files: IndexedFile[],
): SystemRoleSummary | undefined {
  const byId = new Map(files.map((f) => [f.id, f]));
  const focal = byId.get(focalId);
  if (!focal) {
    return undefined;
  }

  const edges = buildEdges(files);
  const moduleImports = focal.imports.filter((spec) => !spec.startsWith('.'));

  const dependsOn = edgesFrom(edges, focal.id)
    .filter((e) => e.type === 'imports')
    .map((e) => byId.get(e.toId)!.path);

  const inbound = edgesTo(edges, focal.id);
  const dependents = inbound
    .filter((e) => e.type !== 'tests')
    .map((e) => ({
      path: byId.get(e.fromId)!.path,
      why: e.type === 'imports' ? `imports ${focal.path}` : `uses ${e.via}`,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const testedBy = inbound
    .filter((e) => e.type === 'tests')
    .map((e) => byId.get(e.fromId)!.path)
    .sort();

  return {
    path: focal.path,
    language: focal.language,
    summary: focal.summary,
    exports: focal.exports.slice(0, MAX_LIST),
    moduleImports: moduleImports.slice(0, MAX_LIST),
    dependsOn: dependsOn.slice(0, MAX_LIST),
    dependents: dependents.slice(0, MAX_LIST),
    testedBy: testedBy.slice(0, MAX_LIST),
  };
}

/** Render the summary as a prompt block. Empty sections are omitted. */
export function systemRoleBlock(summary: SystemRoleSummary): string {
  const lines = [
    '# Module graph (verified, from the local index — treat as ground truth)',
    `- File: ${summary.path} (${summary.language})`,
  ];
  if (summary.summary) {
    lines.push(`- Summary: ${summary.summary}`);
  }
  if (summary.exports.length) {
    lines.push(`- Exposes: ${summary.exports.join(', ')}`);
  }
  if (summary.moduleImports.length) {
    lines.push(`- Imports (modules): ${summary.moduleImports.join(', ')}`);
  }
  if (summary.dependsOn.length) {
    lines.push(`- Depends on (local files): ${summary.dependsOn.join(', ')}`);
  }
  if (summary.dependents.length) {
    lines.push('- Depended on by:');
    for (const d of summary.dependents) {
      lines.push(`  - ${d.path} (${d.why})`);
    }
  } else {
    lines.push('- Depended on by: no indexed file (may be an entry point or unused).');
  }
  if (summary.testedBy.length) {
    lines.push(`- Tested by: ${summary.testedBy.join(', ')}`);
  }
  return lines.join('\n');
}
