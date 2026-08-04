import type {
  ContextPacket,
  ExplanationTask,
} from '../context/ContextPacket';
import type { RetrievedContext } from '../rag/Retriever';
import type { CodeFacts } from '../context/codeFacts';
import {
  scopeIncludesRelatedFiles,
  scopeIncludesSystemContext,
} from '../privacy/privacyScope';

/**
 * Turns a `ContextPacket` into a single structured prompt string for Claude.
 * Pure (no `vscode` import) so it is unit-testable.
 *
 * The instruction block is fixed (Build Order #11) to keep explanations honest:
 * explain only from provided context, flag inferences, never invent files/APIs.
 */

const SYSTEM_INSTRUCTIONS = `You are SimpleeCode, a careful code-explanation assistant. The reader is dyslexic, so writing clearly matters as much as being correct.

Act like a patient tutor: a deterministic draft explanation may be provided below. Polish it, connect the dots, and teach at the reader's level. Build on the draft — do not contradict it or repeat it word-for-word.

Honesty rules:
- Explain ONLY from the context provided below. Do not assume hidden files, routes, APIs, or dependencies exist.
- If you must infer something not present in the context, say "Inferred:" and keep it brief.
- Cite file paths and line ranges that appear in the context when you reference code.
- Never reproduce or guess secret values; redacted markers were removed on purpose.

Accessibility rules (the reader is dyslexic — these are required):
- Use plain, simple words. Explain any technical term the first time you use it.
- Short sentences. One idea per sentence.
- Lead with the answer, then the detail.
- Be concise, not dense. Prefer short bullet points and white space over long paragraphs.`;

const TASK_HEADERS: Record<ExplanationTask, string> = {
  explain_selection: 'Explain the selected code.',
  explain_file: 'Explain this file.',
  explain_system_role: 'Explain how this code fits the wider system.',
};

/** Re-run "modes" (Build Order #14) layered on top of the accessibility rules. */
export type ExplanationMode = 'standard' | 'beginner' | 'detailed' | 'debug';

const MODE_INSTRUCTIONS: Record<ExplanationMode, string> = {
  standard: '',
  beginner:
    'Mode: BEGINNER. Assume no prior knowledge of this codebase or language. Define every term simply and go slowly.',
  detailed:
    'Mode: DETAILED. Go deeper — cover edge cases, trade-offs, and why the code is written this way. Keep the short, scannable formatting.',
  debug:
    'Mode: DEBUG. Focus on what could go wrong — likely bugs, risky edge cases, and concrete steps to debug this code.',
};

const OUTPUT_SHAPE = `Answer so it is easy to read (the reader is dyslexic):
- Start with ONE plain sentence that answers the question.
- Then use these short headings. Skip any you cannot ground in the context:
  - What this does
  - Why it exists
  - How it connects (to the function, the file, and the wider code)
  - Watch out for
- Keep each point to 1-3 short lines. Use bullet points, not long paragraphs.`;

export function buildPrompt(
  packet: ContextPacket,
  retrieved: RetrievedContext[] = [],
  mode: ExplanationMode = 'standard',
  facts?: CodeFacts,
  draftExplanation?: string,
  /** Pre-rendered module-graph block for explain_system_role (see systemRole.ts). */
  systemRoleBlock?: string,
): string {
  const parts: string[] = [];

  parts.push(SYSTEM_INSTRUCTIONS);
  parts.push(`# Task\n${TASK_HEADERS[packet.task]}`);

  if (packet.userPrompt && packet.userPrompt !== TASK_HEADERS[packet.task]) {
    parts.push(`# User question\n${packet.userPrompt}`);
  }

  parts.push(buildFocusBlock(packet));

  if (facts) {
    parts.push(buildFactsBlock(facts));
  }

  if (systemRoleBlock && scopeIncludesSystemContext(packet.privacyScope)) {
    parts.push(systemRoleBlock);
  }

  const code = buildCodeBlock(packet);
  if (code) {
    parts.push(code);
  }

  if (draftExplanation) {
    parts.push(
      `# Draft explanation (deterministic — written from the code's structure and doc comments)\nPolish this and connect the dots for the reader. Build on it; do not contradict it or repeat it word-for-word.\n\n${draftExplanation}`,
    );
  }

  if (retrieved.length > 0 && scopeIncludesRelatedFiles(packet.privacyScope)) {
    parts.push(buildRetrievedBlock(retrieved));
  }

  parts.push(`# Privacy scope\nOnly this scope was shared: ${packet.privacyScope}.`);

  if (packet.meta?.redactions && packet.meta.redactions.length > 0) {
    parts.push(
      `# Context notes\n${packet.meta.redactions.map((r) => `- ${r}`).join('\n')}`,
    );
  }

  if (mode !== 'standard' && MODE_INSTRUCTIONS[mode]) {
    parts.push(`# Explanation mode\n${MODE_INSTRUCTIONS[mode]}`);
  }

  parts.push(OUTPUT_SHAPE);

  return parts.join('\n\n');
}

function buildRetrievedBlock(items: RetrievedContext[]): string {
  const blocks = items.map((it) => {
    const range = it.range ? ` (${it.range})` : '';
    return `## ${it.sourceType}: ${it.path}${range} — ${it.reasonIncluded}\n\`\`\`\n${it.content}\n\`\`\``;
  });
  return `# Related context (retrieved deterministically: imports, README, config)\n${blocks.join('\n\n')}`;
}

function buildFactsBlock(facts: CodeFacts): string {
  const lines = [`- Symbol: ${facts.symbol}`];
  if (facts.kind) {
    lines.push(
      facts.kindMeaning
        ? `- Kind: ${facts.kind} — ${facts.kindMeaning}`
        : `- Kind: ${facts.kind}`,
    );
  }
  if (facts.signature) {
    lines.push(`- Type / signature: ${facts.signature}`);
  }
  if (facts.plain) {
    lines.push(`- In plain words: ${facts.plain}`);
  }
  if (facts.definition) {
    lines.push(`- Defined at: ${facts.definition}`);
  }
  if (facts.callerCount !== undefined) {
    lines.push(`- Used in: ${facts.callerCount} place(s)`);
  }
  if (facts.doc) {
    lines.push(`- Doc comment: ${facts.doc}`);
  }
  if (facts.structure) {
    const s = facts.structure;
    if (s.variables.length) {
      lines.push(
        `- Variables declared: ${s.variables
          .map((v) => `${v.name}${v.type ? `: ${v.type}` : ''} (${v.kind})`)
          .join(', ')}`,
      );
    }
    if (s.calls.length) {
      lines.push(`- Calls: ${s.calls.join(', ')}`);
    }
    const shape = [
      s.loops && `${s.loops} loop(s)`,
      s.branches && `${s.branches} branch(es)`,
      s.returns && `${s.returns} return(s)`,
    ].filter(Boolean);
    if (shape.length) {
      lines.push(`- Structure: ${shape.join(', ')}`);
    }
  }
  return `# Verified facts (from the code itself and the language server — treat as ground truth)\n${lines.join('\n')}`;
}

function buildFocusBlock(packet: ContextPacket): string {
  const lines: string[] = ['# Focus'];
  lines.push(`- File: ${packet.filePath ?? '(untitled buffer)'}`);
  if (packet.languageId) {
    lines.push(`- Language: ${packet.languageId}`);
  }
  if (packet.startLine !== undefined && packet.endLine !== undefined) {
    lines.push(`- Lines: ${packet.startLine}-${packet.endLine}`);
  }
  if (packet.symbolName) {
    lines.push(`- Parent symbol: ${packet.symbolName}`);
  }
  return lines.join('\n');
}

function buildCodeBlock(packet: ContextPacket): string | undefined {
  const fence = fenceFor(packet.languageId);
  if (packet.task === 'explain_selection' && packet.selectedText) {
    return `# Selected code\n${fence}\n${packet.selectedText}\n\`\`\``;
  }
  if (packet.fullText) {
    const label = packet.task === 'explain_selection' ? 'File (for context)' : 'File';
    return `# ${label}\n${fence}\n${packet.fullText}\n\`\`\``;
  }
  if (packet.selectedText) {
    return `# Selected code\n${fence}\n${packet.selectedText}\n\`\`\``;
  }
  return undefined;
}

function fenceFor(languageId?: string): string {
  return '```' + (languageId ?? '');
}
